import { ALL, parse } from 'partial-json'

type FormDataRange = [number, number, boolean]

function parseGptJson<T = any>(json: string): Partial<T> | null {
  const match = json.match(/```json(.+?)```/s)
  if (match) {
    json = match[1]
  }
  return parse(json, ALL)
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
  return values
    .map((value) => value.trim())
    .filter(Boolean)
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

export function parseFiltering(content: string) {
  interface Item {
    reason: string
    score: number
  }
  let res: Partial<{
    negative: Item[]
    positive: Item[]
  }> | null = null
  try {
    res = parseGptJson<{
      negative: Item[]
      positive: Item[]
    }>(content)
  } catch {
    return {
      res: null,
      message: '无法解析模型输出',
      rating: Number.NEGATIVE_INFINITY,
      data: {
        negative: undefined,
        positive: undefined,
      },
    }
  }

  const hand = (acc: { score: number; reason: string }, curr: Item) => ({
    score: acc.score + Math.abs(curr.score),
    reason: `${acc.reason}\n${curr.reason}/(${Math.abs(curr.score)}分)`,
  })
  const data = {
    negative: res?.negative?.reduce(hand, { score: 0, reason: '' }),
    positive: res?.positive?.reduce(hand, { score: 0, reason: '' }),
  }

  const rating = (data?.positive?.score ?? 0) - (data?.negative?.score ?? 0)

  const message = `分数${rating}\n消极:${data?.negative?.reason}\n\n积极:${data?.positive?.reason}`

  return { res, message, rating, data }
}
