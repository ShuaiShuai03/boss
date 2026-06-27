function collectSecretStrings(value: unknown, result: string[] = []) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length >= 4) result.push(trimmed)
    return result
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSecretStrings(item, result))
    return result
  }

  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectSecretStrings(item, result),
    )
  }

  return result
}

export function sanitizeSensitiveText(value: string, secrets: unknown[] = []) {
  let result = value
  for (const secret of new Set(secrets.flatMap((item) => collectSecretStrings(item)))) {
    result = result.replaceAll(secret, '[REDACTED]')
  }

  return result
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key|token|cookie|authorization)(["'\s:=]+)[^"',\s}]+/gi, '$1$2***')
}

export function sanitizeErrorMessage(error: unknown, secrets: unknown[] = []) {
  return sanitizeSensitiveText(error instanceof Error ? error.message : String(error), secrets)
}
