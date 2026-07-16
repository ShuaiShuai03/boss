import { jsonSchema } from 'ai'
import { ALL, parse } from 'partial-json'

type FormDataRange = [number, number, boolean]

export interface FilteringItem {
  reason: string
  score: number
}

export interface FilteringResponse {
  negative: FilteringItem[]
  positive: FilteringItem[]
}

// Single authoritative contract for the AI filtering structured output. Reused both by the
// strict text-mode validator below and by the native JSON schema passed at the SDK request
// boundary (see useModel/agent-output.ts), so the two enforcement paths cannot drift apart.
export const filteringResponseJsonSchema = {
  type: 'object',
  properties: {
    negative: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['reason', 'score'],
      },
    },
    positive: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          score: { type: 'number' },
        },
        required: ['reason', 'score'],
      },
    },
  },
  required: ['negative', 'positive'],
} as const

export type FilteringParseCategory =
  | 'ok'
  | 'non_json'
  | 'missing_field'
  | 'type_mismatch'
  | 'truncated'
  | 'ambiguous'

const filteringFailureLabel: Record<Exclude<FilteringParseCategory, 'ok'>, string> = {
  non_json: '模型未返回可识别的 JSON 结构',
  missing_field: '返回内容缺少 negative/positive 字段',
  type_mismatch: 'reason/score 字段类型不符合约定',
  truncated: '输出被截断或未正常结束，拒绝采用修复后的结果',
  ambiguous: '返回内容包含多个可能结果，无法确定唯一结果',
}

export function filteringFailureMessage(category: Exclude<FilteringParseCategory, 'ok'>) {
  return `AI 岗位筛选失败：${filteringFailureLabel[category]}`
}

function extractBalancedJsonValues(content: string) {
  const values: string[] = []

  for (let start = 0; start < content.length; start++) {
    const opening = content[start]
    if (opening !== '{' && opening !== '[') continue

    const stack: string[] = []
    let inString = false
    let escaped = false

    for (let index = start; index < content.length; index++) {
      const char = content[index]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
      } else if (char === '{' || char === '[') {
        stack.push(char)
      } else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '['
        if (stack.at(-1) !== expected) break
        stack.pop()
        if (stack.length === 0) {
          values.push(content.slice(start, index + 1))
          break
        }
      }
    }
  }

  return values
}

function jsonCandidates(content: string) {
  const candidates: string[] = []
  const add = (value: string) => {
    const trimmed = value.trim()
    if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed)
  }

  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    add(match[1])
  }
  add(content)
  for (const value of extractBalancedJsonValues(content)) add(value)

  return candidates
}

function isFilteringItem(value: unknown): value is FilteringItem {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as FilteringItem).reason === 'string' &&
    typeof (value as FilteringItem).score === 'number' &&
    Number.isFinite((value as FilteringItem).score)
  )
}

function classifyShape(value: unknown): 'missing_field' | 'type_mismatch' | null {
  if (value == null || typeof value !== 'object') return null
  const negative = (value as Partial<FilteringResponse>).negative
  const positive = (value as Partial<FilteringResponse>).positive
  if (!Array.isArray(negative) || !Array.isArray(positive)) return 'missing_field'
  if (![...negative, ...positive].every(isFilteringItem)) return 'type_mismatch'
  return null
}

// `jsonSchema()` alone only advertises the contract to the provider (via response_format); it
// performs no local validation unless a `validate` callback is supplied. Wiring the same shape
// checker used by the text-mode parser here means a provider that claims native JSON support but
// returns an object with the wrong shape fails loudly (NoObjectGeneratedError) instead of
// silently passing an unvalidated value through.
export const filteringOutputSchema = jsonSchema<FilteringResponse>(filteringResponseJsonSchema, {
  validate: (value: unknown) => {
    const shapeCategory = classifyShape(value)
    if (shapeCategory) {
      return { success: false as const, error: new Error(filteringFailureLabel[shapeCategory]) }
    }
    return { success: true as const, value: value as FilteringResponse }
  },
})

function tryParseCandidate(candidate: string): { value: unknown; repaired: boolean } | null {
  try {
    return { value: JSON.parse(candidate), repaired: false }
  } catch {
    // Fall through to the permissive/repairing parser below.
  }
  try {
    return { value: parse(candidate, ALL), repaired: true }
  } catch {
    return null
  }
}

interface FilteringParseOutcome {
  res: FilteringResponse | null
  category: FilteringParseCategory
  repaired: boolean
}

// Every JSON-looking candidate in the response is checked; a result is only accepted if exactly
// one candidate fully matches the contract. This rejects "thinking JSON + result JSON" ambiguity
// and never silently prefers a repaired/truncated candidate over a stricter classification.
function parseFilteringResponse(content: string): FilteringParseOutcome {
  const matches: Array<{ value: FilteringResponse; repaired: boolean }> = []
  const seen = new Set<string>()
  let sawObjectOrArray = false
  let worstShapeCategory: 'missing_field' | 'type_mismatch' | null = null

  for (const candidate of jsonCandidates(content)) {
    const parsed = tryParseCandidate(candidate)
    if (!parsed || parsed.value == null || typeof parsed.value !== 'object') continue
    sawObjectOrArray = true

    const shapeCategory = classifyShape(parsed.value)
    if (shapeCategory) {
      worstShapeCategory =
        worstShapeCategory === 'type_mismatch' ? worstShapeCategory : shapeCategory
      continue
    }

    const value = parsed.value as FilteringResponse
    const dedupeKey = JSON.stringify(value)
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey)
      matches.push({ value, repaired: parsed.repaired })
    }
  }

  if (matches.length === 0) {
    return {
      res: null,
      category: worstShapeCategory ?? (sawObjectOrArray ? 'type_mismatch' : 'non_json'),
      repaired: false,
    }
  }
  if (matches.length > 1) {
    return { res: null, category: 'ambiguous', repaired: false }
  }

  const [match] = matches
  return { res: match.value, category: 'ok', repaired: match.repaired }
}

export function rangeMatchFormat(v: FormDataRange, unit: string): string {
  return `${v[0]} - ${v[1]} ${unit} ${v[2] ? '严格' : '宽松'}`
}

// 匹配范围
export function rangeMatch(rangeStr: string, form: FormDataRange): boolean {
  if (!rangeStr) return false
  let [start, end, mode] = form // mode: true=严格(包含)，false=宽松(重叠)
  if (start > end) {
    ;[start, end] = [end, start]
  }
  const re = /(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/
  const m = String(rangeStr).match(re)
  if (!m) return false

  let inputStart = Number.parseFloat(m[1])
  let inputEnd = Number.parseFloat(m[2] != null ? m[2] : m[1])
  if (!Number.isFinite(inputStart) || !Number.isFinite(inputEnd)) return false

  if (inputStart > inputEnd) {
    ;[inputStart, inputEnd] = [inputEnd, inputStart]
  }
  // console.log({
  //     inputStart,inputEnd,start,end
  // })
  if (mode) {
    // 严格：职位范围(input) 完全覆盖 目标范围(form)
    return start <= inputStart && inputEnd <= end
  } else {
    // 宽松：任意重叠（闭区间）
    return Math.max(inputStart, start) <= Math.min(inputEnd, end)
  }
}

export interface KeywordFilterResult {
  action: 'pass' | 'skip' | 'empty'
  keyword?: string
}

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeFilterKeywords(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function defaultKeywordMatcher(text: string, keyword: string) {
  return text.includes(keyword)
}

export function jobContentKeywordMatcher(text: string, keyword: string) {
  text = text.toLowerCase()
  keyword = keyword.toLowerCase()
  let start = 0
  while (start < text.length) {
    const index = text.indexOf(keyword, start)
    if (index === -1) {
      return false
    }

    const before = text.slice(Math.max(0, index - 6), index)
    const after = text.slice(index + keyword.length)
    const negatedBefore = /(不|无).{0,5}$/.test(before)
    const excludedAfter = /^(系统|软件|工具|服务)/.test(after)

    if (!negatedBefore && !excludedAfter) {
      return true
    }
    start = index + keyword.length
  }
  return false
}

export function evaluateKeywordFilter(
  text: unknown,
  values: string[],
  include: boolean,
  matcher: (text: string, keyword: string) => boolean = defaultKeywordMatcher,
): KeywordFilterResult {
  const keywords = normalizeFilterKeywords(values)
  if (keywords.length === 0) {
    return include ? { action: 'skip' } : { action: 'pass' }
  }

  const normalizedText = typeof text === 'string' ? text.trim().toLowerCase() : ''
  if (!normalizedText) {
    return { action: 'empty' }
  }

  const matchedKeyword = keywords.find((keyword) =>
    matcher(normalizedText, normalizeKeyword(keyword)),
  )
  if (include) {
    return matchedKeyword ? { action: 'pass', keyword: matchedKeyword } : { action: 'skip' }
  }
  return matchedKeyword ? { action: 'skip', keyword: matchedKeyword } : { action: 'pass' }
}

export interface ParseFilteringOptions {
  // The model call's finish reason. Auto-decisions only trust an explicit successful
  // completion; anything else (length/content-filter/error/...) is treated as unsafe
  // to act on even if the truncated JSON happened to be repairable.
  finishReason?: string
}

export function parseFiltering(content: string, opts: ParseFilteringOptions = {}) {
  const { res: parsed, category: parseCategory, repaired } = parseFilteringResponse(content)
  const truncatedByFinishReason = opts.finishReason != null && opts.finishReason !== 'stop'
  const truncated = repaired || truncatedByFinishReason

  if (!parsed || truncated) {
    const category: Exclude<FilteringParseCategory, 'ok'> = !parsed
      ? (parseCategory as Exclude<FilteringParseCategory, 'ok'>)
      : 'truncated'
    return {
      res: null,
      category,
      message: filteringFailureMessage(category),
      rating: Number.NEGATIVE_INFINITY,
      data: {
        negative: undefined,
        positive: undefined,
      },
    }
  }

  const hand = (acc: { score: number; reason: string }, curr: FilteringItem) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: parsed.negative.reduce(hand, { score: 0, reason: '' }),
    positive: parsed.positive.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = data.positive.score - data.negative.score

  const message = `分数${rating}\n消极:${data?.negative?.reason}\n\n积极:${data?.positive?.reason}`

  return { res: parsed, category: 'ok' as const, message, rating, data }
}
