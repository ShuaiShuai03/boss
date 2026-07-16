// Bounds how much of an arbitrary logged value is retained for storage/inspection, without
// touching the original value passed to the real console output. Kept separate from logger.ts
// (which creates a DOM iframe at import time) so it can be unit tested directly.

export const MAX_STORED_STRING_LENGTH = 2000
export const MAX_STORED_DEPTH = 3

export function truncateForStorage(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STORED_STRING_LENGTH
      ? `${value.slice(0, MAX_STORED_STRING_LENGTH)}… [截断，共 ${value.length} 字符]`
      : value
  }
  if (value == null || typeof value !== 'object' || depth >= MAX_STORED_DEPTH) {
    return value
  }
  try {
    if (Array.isArray(value)) {
      return value.map((item) => truncateForStorage(item, depth + 1))
    }
    if (value instanceof Error) {
      return { name: value.name, message: truncateForStorage(value.message, depth + 1) }
    }
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      result[key] = truncateForStorage(item, depth + 1)
    }
    return result
  } catch {
    return '[无法序列化]'
  }
}
