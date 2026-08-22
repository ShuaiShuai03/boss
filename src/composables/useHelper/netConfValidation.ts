import type { NetConf, NotificationAlert, NotificationNotification } from './netConf'

export function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function isNotification(value: unknown): value is NotificationAlert | NotificationNotification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const data = record.data
  if (
    typeof record.key !== 'string' ||
    !record.key ||
    (record.type !== 'alert' && record.type !== 'notification') ||
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    return false
  }
  const url = (data as Record<string, unknown>).url
  return url === undefined || isSafeHttpsUrl(url)
}

export function isNetConf(value: unknown): value is NetConf {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.version !== 'string') return false
  if (
    record.version_description !== undefined &&
    typeof record.version_description !== 'string'
  ) {
    return false
  }
  if (typeof record.feedback !== 'string' || !isSafeHttpsUrl(record.feedback)) return false
  if (!Array.isArray(record.notification) || !record.notification.every(isNotification)) {
    return false
  }
  if (record.store !== undefined) {
    if (!record.store || typeof record.store !== 'object' || Array.isArray(record.store)) {
      return false
    }
    for (const entry of Object.values(record.store as Record<string, unknown>)) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 3 ||
        typeof entry[0] !== 'string' ||
        !isSafeHttpsUrl(entry[1]) ||
        !isSafeHttpsUrl(entry[2])
      ) {
        return false
      }
    }
  }
  return true
}
