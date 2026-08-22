export const bossPageMessageTypes = {
  snapshot: 'boss-helper:page-snapshot',
  changePage: 'boss-helper:page-change',
  selectJob: 'boss-helper:page-select-job',
  sendChat: 'boss-helper:page-send-chat',
} as const

export interface BossPageJobItem {
  securityId: string
  bossAvatar: string
  bossCert: number
  encryptBossId: string
  bossName: string
  bossTitle: string
  goldHunter: number
  bossOnline: boolean
  encryptJobId: string
  jobName: string
  lid: string
  salaryDesc: string
  jobLabels: string[]
  skills: string[]
  jobExperience: string
  jobDegree: string
  cityName: string
  areaDistrict: string
  businessDistrict: string
  gps?: { longitude: number; latitude: number }
  lastModifyTime: number
  encryptBrandId: string
  brandName: string
  brandLogo: string
  brandStageName: string
  brandIndustry: string
  brandScaleName: string
  welfareList: string[]
  contact: boolean
}

export interface BossPageDetail {
  securityId: string
  lid: string
  jobInfo: {
    encryptId: string
    encryptUserId: string
    postDescription: string
    locationName: string
    address: string
    longitude: number
    latitude: number
  }
  bossInfo: {
    activeTimeDesc: string
    bossOnline: boolean
    bossSource: number
    certificated: boolean
  }
  brandComInfo: {
    stageName: string
    introduce: string
    labels: string[]
    activeTime: number
  }
  relationInfo: { beFriend: boolean }
}

export interface BossPageUser {
  uid?: string | number
  userId?: string | number
  encryptUserId?: string
  name?: string
  showName?: string
  tinyAvatar?: string
  largeAvatar?: string
}

export interface BossPageSnapshot {
  path: string
  user: BossPageUser
  jobs: BossPageJobItem[]
  page: { page: number; pageSize: number }
  hasMore: boolean
  detail?: BossPageDetail
}

export type BossPageRequest =
  | { type: typeof bossPageMessageTypes.snapshot }
  | { type: typeof bossPageMessageTypes.changePage; page: number }
  | { type: typeof bossPageMessageTypes.selectJob; encryptJobId: string }
  | {
      type: typeof bossPageMessageTypes.sendChat
      packet: number[]
      payload: number[]
    }

const MAX_SNAPSHOT_JSON_LENGTH = 2_000_000
const MAX_JOBS = 100
const MAX_CHAT_PACKET_BYTES = 256_000

function objectFields(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, maxLength = 2_000): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

function optionalText(value: unknown, maxLength = 2_000): string | undefined {
  const result = text(value, maxLength).trim()
  return result || undefined
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 50)
    .map((item) => text(item, 500))
    .filter(Boolean)
}

function parseJob(value: unknown): BossPageJobItem | null {
  const item = objectFields(value)
  if (!item) return null
  const securityId = text(item.securityId, 500)
  const encryptBossId = text(item.encryptBossId, 500)
  const encryptJobId = text(item.encryptJobId, 500)
  const encryptBrandId = text(item.encryptBrandId, 500)
  const jobName = text(item.jobName, 1_000)
  const lid = text(item.lid, 500)
  if (!securityId || !encryptBossId || !encryptJobId || !encryptBrandId || !jobName || !lid) {
    return null
  }
  const gpsValue = objectFields(item.gps)
  const longitude = numberValue(gpsValue?.longitude, Number.NaN)
  const latitude = numberValue(gpsValue?.latitude, Number.NaN)
  return {
    securityId,
    bossAvatar: text(item.bossAvatar, 4_000),
    bossCert: numberValue(item.bossCert),
    encryptBossId,
    bossName: text(item.bossName, 500),
    bossTitle: text(item.bossTitle, 500),
    goldHunter: numberValue(item.goldHunter),
    bossOnline: item.bossOnline === true,
    encryptJobId,
    jobName,
    lid,
    salaryDesc: text(item.salaryDesc, 500),
    jobLabels: stringList(item.jobLabels),
    skills: stringList(item.skills),
    jobExperience: text(item.jobExperience, 500),
    jobDegree: text(item.jobDegree, 500),
    cityName: text(item.cityName, 500),
    areaDistrict: text(item.areaDistrict, 500),
    businessDistrict: text(item.businessDistrict, 500),
    gps:
      Number.isFinite(longitude) && Number.isFinite(latitude) ? { longitude, latitude } : undefined,
    lastModifyTime: numberValue(item.lastModifyTime),
    encryptBrandId,
    brandName: text(item.brandName, 1_000),
    brandLogo: text(item.brandLogo, 4_000),
    brandStageName: text(item.brandStageName, 500),
    brandIndustry: text(item.brandIndustry, 500),
    brandScaleName: text(item.brandScaleName, 500),
    welfareList: stringList(item.welfareList),
    contact: item.contact === true,
  }
}

export function parseBossPageDetail(value: unknown): BossPageDetail | undefined {
  const detail = objectFields(value)
  const jobInfo = objectFields(detail?.jobInfo)
  const bossInfo = objectFields(detail?.bossInfo)
  const brandComInfo = objectFields(detail?.brandComInfo)
  const relationInfo = objectFields(detail?.relationInfo)
  if (!detail || !jobInfo || !bossInfo || !brandComInfo || !relationInfo) return undefined
  const encryptId = text(jobInfo.encryptId, 500)
  const securityId = text(detail.securityId, 500)
  const lid = text(detail.lid, 500)
  if (!encryptId || !securityId || !lid) return undefined
  return {
    securityId,
    lid,
    jobInfo: {
      encryptId,
      encryptUserId: text(jobInfo.encryptUserId, 500),
      postDescription: text(jobInfo.postDescription, 100_000),
      locationName: text(jobInfo.locationName, 1_000),
      address: text(jobInfo.address, 4_000),
      longitude: numberValue(jobInfo.longitude),
      latitude: numberValue(jobInfo.latitude),
    },
    bossInfo: {
      activeTimeDesc: text(bossInfo.activeTimeDesc, 500),
      bossOnline: bossInfo.bossOnline === true,
      bossSource: numberValue(bossInfo.bossSource),
      certificated: bossInfo.certificated === true,
    },
    brandComInfo: {
      stageName: text(brandComInfo.stageName, 500),
      introduce: text(brandComInfo.introduce, 20_000),
      labels: stringList(brandComInfo.labels),
      activeTime: numberValue(brandComInfo.activeTime),
    },
    relationInfo: { beFriend: relationInfo.beFriend === true },
  }
}

function parseUser(value: unknown): BossPageUser {
  const user = objectFields(value)
  if (!user) return {}
  const uid = typeof user.uid === 'number' ? user.uid : optionalText(user.uid, 500)
  const userId = typeof user.userId === 'number' ? user.userId : optionalText(user.userId, 500)
  return {
    uid,
    userId,
    encryptUserId: optionalText(user.encryptUserId, 500),
    name: optionalText(user.name, 500),
    showName: optionalText(user.showName, 500),
    tinyAvatar: optionalText(user.tinyAvatar, 4_000),
    largeAvatar: optionalText(user.largeAvatar, 4_000),
  }
}

export function parseBossPageSnapshot(value: unknown): BossPageSnapshot | null {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return null
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_JSON_LENGTH) return null
  const snapshot = objectFields(value)
  const pageValue = objectFields(snapshot?.page)
  if (!snapshot || !pageValue) return null
  const path = text(snapshot.path, 2_000)
  if (!path.startsWith('/web/geek/job')) return null
  const jobs = Array.isArray(snapshot.jobs)
    ? snapshot.jobs
        .slice(0, MAX_JOBS)
        .map(parseJob)
        .filter((job): job is BossPageJobItem => job !== null)
    : []
  return {
    path,
    user: parseUser(snapshot.user),
    jobs,
    page: {
      page: Math.max(1, Math.trunc(numberValue(pageValue.page, 1))),
      pageSize: Math.max(1, Math.min(100, Math.trunc(numberValue(pageValue.pageSize, 15)))),
    },
    hasMore: snapshot.hasMore !== false,
    detail: parseBossPageDetail(snapshot.detail),
  }
}

function byteArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHAT_PACKET_BYTES)
    return null
  const bytes: number[] = []
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0 || item > 255) return null
    bytes.push(item)
  }
  return bytes
}

export function parseBossPageRequest(value: unknown): BossPageRequest | null {
  const request = objectFields(value)
  if (!request || typeof request.type !== 'string') return null
  if (request.type === bossPageMessageTypes.snapshot) return { type: request.type }
  if (request.type === bossPageMessageTypes.changePage) {
    const page = numberValue(request.page, Number.NaN)
    return Number.isInteger(page) && page >= 1 && page <= 10_000
      ? { type: request.type, page }
      : null
  }
  if (request.type === bossPageMessageTypes.selectJob) {
    return typeof request.encryptJobId === 'string' &&
      request.encryptJobId.length > 0 &&
      request.encryptJobId.length <= 500
      ? { type: request.type, encryptJobId: request.encryptJobId }
      : null
  }
  if (request.type === bossPageMessageTypes.sendChat) {
    const packet = byteArray(request.packet)
    const payload = byteArray(request.payload)
    return packet && payload ? { type: request.type, packet, payload } : null
  }
  return null
}
