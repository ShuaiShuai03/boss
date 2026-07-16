export interface BossUserSource {
  uid?: unknown
  userId?: unknown
  encryptUserId?: unknown
  name?: unknown
  showName?: unknown
  tinyAvatar?: unknown
  largeAvatar?: unknown
}

export interface ResolvedBossUser {
  accountId: string | undefined
  protocolUserId: string | undefined
  encryptedUserId: string | undefined
  name: string
  avatar: string
}

export interface WaitForBossUserOptions {
  intervalMs?: number
  timeoutMs?: number
  requireProtocolUserId?: boolean
}

const MAX_SIGNED_INT64 = 9223372036854775807n

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

export function normalizeBossProtocolUserId(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : undefined
  }
  if (typeof value === 'bigint') {
    return value > 0n && value <= MAX_SIGNED_INT64 ? value.toString() : undefined
  }
  if (typeof value !== 'string') return undefined

  const normalized = value.trim()
  if (!/^[1-9]\d*$/.test(normalized)) return undefined
  return BigInt(normalized) <= MAX_SIGNED_INT64 ? normalized : undefined
}

export function normalizeBossOpaqueUserId(value: unknown): string | undefined {
  return normalizeText(value)
}

export function bossProtocolUserIdToSafeNumber(value: unknown): number | undefined {
  const normalized = normalizeBossProtocolUserId(value)
  if (!normalized) return undefined
  const numberValue = Number(normalized)
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

export function resolveBossUser(
  ...sources: Array<BossUserSource | null | undefined>
): ResolvedBossUser {
  let protocolUserId: string | undefined
  let encryptedUserId: string | undefined
  let name: string | undefined
  let avatar: string | undefined

  for (const source of sources) {
    if (!source) continue
    protocolUserId ??=
      normalizeBossProtocolUserId(source.uid) ?? normalizeBossProtocolUserId(source.userId)
    encryptedUserId ??= normalizeBossOpaqueUserId(source.encryptUserId)
    name ??= normalizeText(source.showName) ?? normalizeText(source.name)
    avatar ??= normalizeText(source.largeAvatar) ?? normalizeText(source.tinyAvatar)
  }

  return {
    accountId: encryptedUserId ?? protocolUserId,
    protocolUserId,
    encryptedUserId,
    name: name ?? '',
    avatar: avatar ?? '',
  }
}

export async function waitForBossUser(
  getSources: () => Array<BossUserSource | null | undefined>,
  options: WaitForBossUserOptions = {},
): Promise<ResolvedBossUser> {
  const intervalMs = options.intervalMs ?? 100
  const timeoutMs = options.timeoutMs ?? 10000
  const startedAt = Date.now()
  let user = resolveBossUser(...getSources())
  const isReady = () =>
    user.accountId != null && (!options.requireProtocolUserId || user.protocolUserId != null)

  while (!isReady() && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs))
    user = resolveBossUser(...getSources())
  }

  return user
}
