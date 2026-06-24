const endpointTails = [
  ['chat', 'completions'],
  ['responses'],
  ['models'],
  ['completions'],
  ['embeddings'],
]

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function segmentsEndWith(segments: string[], tail: string[]) {
  if (segments.length < tail.length) return false
  return tail.every((item, index) => segments[segments.length - tail.length + index] === item)
}

export function normalizeOpenaiBaseUrl(baseUrl: string) {
  const trimmed = trimTrailingSlash(baseUrl.trim())
  if (!trimmed) return ''

  try {
    const url = new URL(trimmed)
    url.hash = ''
    url.search = ''

    let segments = url.pathname.split('/').filter(Boolean)
    const matchedTail = endpointTails.find((tail) => segmentsEndWith(segments, tail))
    if (matchedTail) {
      segments = segments.slice(0, -matchedTail.length)
    }

    url.pathname = segments.length ? `/${segments.join('/')}` : ''
    return trimTrailingSlash(url.toString())
  } catch {
    return trimTrailingSlash(
      trimmed.replace(/\/(?:chat\/completions|responses|models|completions|embeddings)$/i, ''),
    )
  }
}

function joinApiPath(baseUrl: string, path: string) {
  return `${normalizeOpenaiBaseUrl(baseUrl)}${path}`
}

function hasVersionPath(baseUrl: string) {
  try {
    const segments = new URL(baseUrl).pathname.split('/').filter(Boolean)
    return segments.some((segment) => /^v\d+$/i.test(segment))
  } catch {
    return /(?:^|\/)v\d+(?:\/|$)/i.test(baseUrl)
  }
}

export interface ModelEndpointCandidate {
  baseUrl: string
  modelsUrl: string
}

export function getModelEndpointCandidates(baseUrl: string): ModelEndpointCandidate[] {
  const normalizedBaseUrl = normalizeOpenaiBaseUrl(baseUrl)
  if (!normalizedBaseUrl) return []

  const candidates: ModelEndpointCandidate[] = [
    {
      baseUrl: normalizedBaseUrl,
      modelsUrl: joinApiPath(normalizedBaseUrl, '/models'),
    },
  ]

  if (!hasVersionPath(normalizedBaseUrl)) {
    const v1BaseUrl = joinApiPath(normalizedBaseUrl, '/v1')
    candidates.push({
      baseUrl: v1BaseUrl,
      modelsUrl: joinApiPath(v1BaseUrl, '/models'),
    })
  }

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.modelsUrl)) return false
    seen.add(candidate.modelsUrl)
    return true
  })
}

function collectArrays(value: unknown, depth = 0): unknown[][] {
  if (Array.isArray(value)) return [value]
  if (!value || typeof value !== 'object' || depth > 2) return []

  const result: unknown[][] = []
  const objectValue = value as Record<string, unknown>
  for (const key of ['data', 'models', 'model_list', 'modelList', 'items', 'result']) {
    result.push(...collectArrays(objectValue[key], depth + 1))
  }
  return result
}

function getModelId(item: unknown) {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return null

  const objectValue = item as Record<string, unknown>
  for (const key of ['id', 'name', 'model', 'value']) {
    const value = objectValue[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

export function parseOpenaiModelIds(body: string) {
  const data = JSON.parse(body) as unknown
  return Array.from(
    new Set(
      collectArrays(data)
        .flatMap((items) => items.map(getModelId))
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
    ),
  )
}

export function previewBody(body: string, maxLength = 300) {
  const compact = body.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}

function parseJsonField(value: unknown, field: string): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined

  try {
    return JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`${field} 不是有效的 JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function normalizeObjectField(value: unknown, field: string): Record<string, any> {
  const parsed = parseJsonField(value, field)
  if (parsed == null) return {}
  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, any>
  }
  throw new Error(`${field} 必须是 JSON 对象`)
}

function normalizeArrayField(value: unknown, field: string): Array<Record<string, any>> | undefined {
  const parsed = parseJsonField(value, field)
  if (parsed == null) return undefined
  if (Array.isArray(parsed)) {
    return parsed as Array<Record<string, any>>
  }
  throw new Error(`${field} 必须是 JSON 数组`)
}

export function normalizeOpenaiConfig<T extends Record<string, any>>(conf: T): T {
  const advanced = {
    ...(conf.advanced ?? {}),
  } as Record<string, any>

  advanced.extra_headers = normalizeObjectField(advanced.extra_headers, 'advanced.extra_headers')
  advanced.extra_body = normalizeObjectField(advanced.extra_body, 'advanced.extra_body')
  advanced.tools = normalizeArrayField(advanced.tools, 'advanced.tools')

  return {
    ...conf,
    base_url: typeof conf.base_url === 'string' ? normalizeOpenaiBaseUrl(conf.base_url) : conf.base_url,
    other: {
      ...(conf.other ?? {}),
    },
    advanced,
  }
}
