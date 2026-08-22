import { ref, shallowRef } from 'vue'
import { browser } from 'wxt/browser'

import {
  bossPageMessageTypes,
  parseBossPageSnapshot,
  type BossPageDetail,
  type BossPageJobItem,
  type BossPageSnapshot,
  type BossPageUser,
} from './pageProtocol'

interface PageOperationResponse {
  ok: boolean
  value?: unknown
  error?: string
}

const SNAPSHOT_INTERVAL_MS = 500
const SNAPSHOT_READY_TIMEOUT_MS = 20_000

async function sendPageOperation(message: object) {
  const response: unknown = await browser.runtime.sendMessage(message)
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('页面适配器返回了无效响应')
  }
  const result = response as PageOperationResponse
  if (result.ok !== true) throw new Error(result.error || '页面适配操作失败')
  return result.value
}

export class BossPageGateway {
  readonly path = ref(location.pathname)
  readonly user = shallowRef<BossPageUser>({})
  readonly jobs = shallowRef<BossPageJobItem[]>([])
  readonly page = shallowRef({ page: 1, pageSize: 15 })
  readonly hasMore = ref(true)
  readonly detail = shallowRef<BossPageDetail>()
  readonly ready = ref(false)
  readonly error = ref<string | null>(null)

  private timer: number | undefined
  private refreshPromise: Promise<void> | null = null

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = (async () => {
      try {
        const raw = await sendPageOperation({ type: bossPageMessageTypes.snapshot })
        const snapshot = parseBossPageSnapshot(raw)
        if (!snapshot) throw new Error('页面快照不符合固定契约')
        this.applySnapshot(snapshot)
        this.ready.value = true
        this.error.value = null
      } catch (error) {
        this.error.value = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        this.refreshPromise = null
      }
    })()
    return this.refreshPromise
  }

  async start() {
    const startedAt = Date.now()
    while (!this.ready.value && Date.now() - startedAt < SNAPSHOT_READY_TIMEOUT_MS) {
      await this.refresh().catch(() => undefined)
      if (!this.ready.value) {
        const { promise, resolve } = Promise.withResolvers<void>()
        window.setTimeout(resolve, SNAPSHOT_INTERVAL_MS)
        await promise
      }
    }
    if (!this.ready.value) throw new Error(this.error.value || '无法读取 BOSS 岗位页面')
    if (this.timer == null) {
      this.timer = window.setInterval(() => {
        this.path.value = location.pathname
        if (this.path.value.startsWith('/web/geek/job')) {
          void this.refresh().catch(() => undefined)
        }
      }, SNAPSHOT_INTERVAL_MS)
    }
  }

  dispose() {
    if (this.timer != null) window.clearInterval(this.timer)
    this.timer = undefined
  }

  async changePage(page: number) {
    await sendPageOperation({ type: bossPageMessageTypes.changePage, page })
    await this.refresh()
  }

  async selectJob(encryptJobId: string) {
    await sendPageOperation({ type: bossPageMessageTypes.selectJob, encryptJobId })
  }

  async sendChat(packet: Uint8Array, payload: Uint8Array) {
    const value = await sendPageOperation({
      type: bossPageMessageTypes.sendChat,
      packet: Array.from(packet),
      payload: Array.from(payload),
    })
    if (!value || typeof value !== 'object' || Array.isArray(value) || !('transport' in value)) {
      throw new Error('聊天发送未返回有效传输结果')
    }
    const transport = value.transport
    if (transport !== 'ChatWebsocket' && transport !== 'socket') {
      throw new Error('聊天发送未使用允许的页面传输')
    }
    return transport
  }

  private applySnapshot(snapshot: BossPageSnapshot) {
    this.path.value = location.pathname
    this.user.value = snapshot.user
    this.jobs.value = snapshot.jobs
    this.page.value = snapshot.page
    this.hasMore.value = snapshot.hasMore
    this.detail.value = snapshot.detail
  }
}

export const bossPageGateway = new BossPageGateway()
