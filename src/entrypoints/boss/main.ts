import { UserContent } from 'ai'
import { ref } from 'vue'

import { appearanceConf } from '@/composables/conf'
import { checkJobCache } from '@/composables/useApplying'
import { GreetError } from '@/composables/useApplying/deliverError'
import { createLazyObject, WorkflowData } from '@/composables/useApplying/type'
import { HelperContext, JobData } from '@/composables/useHelper'
import { Message } from '@/composables/useWebSocket/protobuf'
import type { AiReplySendTarget } from '@/features/aiReply/types'
import { createBossHelperJobElement, disposeBossHelperJobElement, run } from '@/index'
import { type BossPageGateway } from '@/message/pageGateway'
import type { BossPageJobItem } from '@/message/pageProtocol'
import { resolveBossUser, waitForBossUser } from '@/utils/bossIdentity'
import { logger } from '@/utils/logger'

import { BoosJobData, bossWorkflow } from './delivery'
import { requestBossData } from './requests'
let activeBossHelper: BossHelperCtx | undefined

function viewDisposedError() {
  const error = new Error('页面资源已释放')
  error.name = 'AbortError'
  return error
}

function waitForElement<E extends Element>(selectors: string, signal: AbortSignal) {
  const existing = document.querySelector<E>(selectors)
  if (existing) return Promise.resolve(existing)

  return new Promise<E>((resolve, reject) => {
    let timeout: number | undefined
    const observer = new MutationObserver(() => {
      const element = document.querySelector<E>(selectors)
      if (!element) return
      cleanup()
      resolve(element)
    })
    const onAbort = () => {
      cleanup()
      reject(viewDisposedError())
    }
    const cleanup = () => {
      if (timeout != null) window.clearTimeout(timeout)
      observer.disconnect()
      signal.removeEventListener('abort', onAbort)
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error(`未找到岗位页面元素: ${selectors}`))
    }, 20_000)
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
}

function removeAd() {
  const selectors = [
    '.job-list-wrapper .subscribe-weixin-wrapper',
    '.job-side-wrapper',
    '.side-bar-box',
    '.go-login-btn',
    '.c-subscribe-weixin',
    '.c-job-tools.job-tools',
    '.c-hot-link.hot-link',
    '.c-breadcrumb',
  ]
  const removeMatches = () => {
    document.querySelectorAll(selectors.join(',')).forEach((element) => element.remove())
  }
  let scanScheduled = false
  const scheduleRemove = () => {
    if (scanScheduled) return
    scanScheduled = true
    queueMicrotask(() => {
      scanScheduled = false
      removeMatches()
    })
  }
  const observer = new MutationObserver(scheduleRemove)
  observer.observe(document.body, { childList: true, subtree: true })
  removeMatches()
  return () => observer.disconnect()
}

function isBossJobRoute(path: string) {
  return path.startsWith('/web/geek/job')
}

function formatActiveTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const day = 24 * 60 * 60 * 1000

  if (diff < day) return '今日活跃'
  if (diff < 2 * day) return '昨日活跃'
  if (diff < 7 * day) return '本周活跃'
  if (diff < 30 * day) return '本月活跃'
  return '较久未活跃'
}

function convertBossZpJobItemToJobData(item: BossPageJobItem): JobData {
  const key = `boss::${item.encryptJobId}`

  return {
    key,
    duplicateCompanyId: item.encryptBrandId,
    duplicateHrId: item.encryptBossId,
    link: `https://www.zhipin.com/job_detail/${item.encryptJobId}.html`,
    jobName: item.jobName,
    positionName: item.jobName,
    jobDescription: '',

    // 经验和学历要求 - 从 jobLabels 中解析或直接使用
    experienceName: item.jobExperience || item.jobLabels?.[0] || '经验不限',
    degreeName: item.jobDegree || '学历不限',
    salary: item.salaryDesc,

    // 地址相关
    address: [item.cityName, item.areaDistrict, item.businessDistrict].filter(Boolean).join('-'),
    addressCoords: item.gps ? [item.gps.longitude, item.gps.latitude] : undefined,

    // 技能标签
    showSkills: item.skills || [],
    jobLabels: item.jobLabels || [],
    skills: item.skills || [],

    // 活跃时间 - 从 lastModifyTime 获取
    activeTime: item.lastModifyTime,
    activeTimeStr: item.lastModifyTime ? formatActiveTime(item.lastModifyTime) : undefined,

    // 福利
    welfareList: item.welfareList,

    // 招聘者信息
    boss: {
      link: `https://www.zhipin.com/boss_detail/${item.encryptBossId}.html`,
      name: item.bossName,
      title: item.bossTitle,
      avatar: item.bossAvatar,
      certificated: item.bossCert > 0,
      isHeadhunter: item.goldHunter === 1,
      isFriend: false,
      isOnline: item.bossOnline ?? false,
    },

    // 公司品牌信息
    brand: {
      link: `https://www.zhipin.com/gongsi/${item.encryptBrandId}.html`,
      name: item.brandName,
      logo: item.brandLogo,
      scale: item.brandScaleName,
      industry: item.brandIndustry,
      stageName: item.brandStageName,
      introduce: '',
      labels: [],
    },

    // 状态信息
    // status: {
    //   status: item.contact ? 'warn' : 'pending',
    //   msg: item.contact ? '已沟通' : '未开始',
    // },
  }
}

function normalizeMessageContent(msg: UserContent): string {
  if (typeof msg === 'string') {
    return msg.trim()
  }

  if (Array.isArray(msg)) {
    return msg
      .map((item: any) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return String(msg ?? '').trim()
}

async function waitForJobPageChange(changed: () => boolean, timeoutMs = 10000, intervalMs = 250) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (changed()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return changed()
}

export class BossHelperCtx extends HelperContext<BossHelperCtx, BoosJobData, {}> {
  _page: Ref<{ page: number; pageSize: number }>
  _pageHasMore: Ref<boolean>
  _jobDetail: Ref<BoosJobData['detail'] | undefined>
  _jobList: Ref<BossPageJobItem[]>
  _jobDataMap: Map<string, BoosJobData>

  jobMaps: Map<string, WorkflowData<BoosJobData, {}>>
  jobList: Ref<JobData[]>
  private gateway: BossPageGateway
  private mountPromise: Promise<void> | null = null
  private pendingMountPath: string | null = null
  private reconciliationPromise: Promise<void> | null = null

  constructor(gateway: BossPageGateway) {
    super()
    this.gateway = gateway
    this._page = gateway.page
    this._pageHasMore = gateway.hasMore
    this._jobDetail = gateway.detail
    this._jobList = gateway.jobs
    this._jobDataMap = new Map()
    this.jobList = ref<JobData[]>([])
    this.jobMaps = reactive(new Map())
    this.registerDisposer(watch(gateway.jobs, () => this.syncJobList(), { immediate: true }))
  }

  get uid() {
    return this._resolveUser().accountId ?? ''
  }

  get protocolUserId() {
    return this._resolveUser().protocolUserId ?? ''
  }

  get userInfo() {
    const user = this._resolveUser()
    return {
      id: user.accountId ?? '',
      name: user.name,
      avatar: user.avatar,
    }
  }

  _resolveUser() {
    return resolveBossUser(this.gateway.user.value)
  }

  static async new(gateway: BossPageGateway) {
    const ctx = new BossHelperCtx(gateway)
    const user = await waitForBossUser(() => [gateway.user.value], {
      requireProtocolUserId: true,
    })
    if (!user.accountId || !user.protocolUserId) {
      useToast().add({
        color: 'error',
        title: '未获取到用户ID，可能会出现奇怪bug, 请尝试刷新页面或反馈',
      })
    }
    ctx.workflow = await bossWorkflow(ctx)
    return ctx
  }

  async loadMoreJob(delay: Promise<any>): Promise<boolean> {
    try {
      if (!this._pageHasMore.value) {
        this.logs.info('无更多岗位', 'BOSS 页面 hasMore=false')
        return false
      }
      const oldLen = this._jobList.value.length
      const oldPage = this._page.value.page
      const oldFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''

      this.logs.info('开始翻页', `从第 ${oldPage} 页请求下一页`)
      await this.gateway.changePage(oldPage + 1)
      const changed = await waitForJobPageChange(() => {
        const currentFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''
        return this._page.value.page !== oldPage || oldFirstJobId !== currentFirstJobId
      })
      await delay
      const currentFirstJobId = this._jobList.value[0]?.encryptJobId ?? ''
      if (
        (location.href.includes('/web/geek/job-recommend') ||
          location.href.includes('/web/geek/jobs')) &&
        !changed &&
        oldLen === this._jobList.value.length &&
        oldFirstJobId === currentFirstJobId
      ) {
        logger.error('翻页: 内容无变化')
        this.logs.info('翻页失败', 'BOSS 页面内容无变化')
        return false
      }
    } catch (err) {
      logger.error('翻页: 下一页错误', err)
      this.logs.info('翻页失败', err instanceof Error ? err.message : String(err))
      return false
    }
    return true
  }
  async selectJob(job: BossPageJobItem) {
    await this.gateway.selectJob(job.encryptJobId)
    await this.gateway.refresh()
  }

  async start() {
    if (this.workflow?.stopReason.value?.code === 'context_invalidated') {
      await this.notification('扩展已更新，请刷新页面后再继续', {
        toast: {
          color: 'error',
        },
      })
      return
    }
    try {
      await this.ensureInitialized()
    } catch {
      await this.notification('配置尚未就绪，请先重试加载后再开始投递', {
        toast: {
          color: 'error',
          description: this.initializationError.value ?? undefined,
        },
      })
      return
    }
    if (!this.uid || !this.protocolUserId) {
      await this.notification('未获取到用户ID，请刷新页面后重试', {
        toast: {
          color: 'error',
        },
      })
      return
    }
    if (!this.conf.formData.autoApplyEnabled.value) {
      await this.notification('自动投递未启用', {
        toast: {
          color: 'warning',
        },
      })
      return
    }
    const workflow = this.workflow ?? (this.workflow = await bossWorkflow(this))
    await workflow.executeAll(this._jobDataMap)
  }

  async sendMessage(jobKey: string, msg: UserContent, signal?: AbortSignal) {
    const data = this.jobMaps.get(jobKey)
    if (!data) {
      throw new GreetError('未找到岗位上下文')
    }

    const content = normalizeMessageContent(msg)
    if (!content) {
      throw new GreetError('打招呼内容为空')
    }

    const bossData = await requestBossData(
      {
        encryptUserId:
          data.rawData.detail.jobInfo.encryptUserId || data.rawData.jobitem.encryptBossId,
        securityId: data.rawData.jobitem.securityId,
      },
      {
        bossSrc: data.rawData.detail.bossInfo.bossSource,
        signal,
      },
    )

    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    data.state.bossData = bossData
    data.state.message = content

    if (!this.protocolUserId) {
      throw new GreetError('未获取到当前用户 uid')
    }

    const message = new Message({
      form_uid: this.protocolUserId,
      to_uid: String(bossData.data.bossId),
      to_name: bossData.data.encryptBossId,
      friend_source: bossData.data.bossSource,
      content,
    })

    await message.send(signal)
    logger.info('消息发送成功', { jobKey, bossId: bossData.data.encryptBossId })
  }

  async sendChatMessage(target: AiReplySendTarget, signal?: AbortSignal) {
    const content = target.text.trim()
    if (!content) {
      throw new Error('回复内容为空')
    }
    if (!target.toUid) {
      throw new Error('缺少 Boss/HR 用户 ID')
    }
    if (!this.protocolUserId) {
      throw new Error('未获取到当前用户 uid')
    }

    const message = new Message({
      form_uid: this.protocolUserId,
      to_uid: target.toUid,
      to_name: target.toName ?? '',
      friend_source: target.friendSource,
      content,
    })

    await message.send(signal)
    logger.info('聊天消息发送成功', { conversationId: target.conversationId, toUid: target.toUid })
  }
  async onMount(path?: string) {
    this.pendingMountPath = path ?? this.gateway.path.value
    if (this.mountPromise) return this.mountPromise
    this.mountPromise = (async () => {
      while (this.pendingMountPath !== null) {
        const nextPath = this.pendingMountPath
        this.pendingMountPath = null
        try {
          await this.mountView(nextPath)
        } catch (error) {
          if (this.pendingMountPath === null) throw error
          logger.info('页面挂载已被新的路由生命周期请求取代')
        }
      }
    })()
    try {
      await this.mountPromise
    } finally {
      this.mountPromise = null
    }
  }

  async reconcileWorkflow(trigger = 'lifecycle') {
    if (this.reconciliationPromise) return this.reconciliationPromise
    this.reconciliationPromise = (async () => {
      await this.ensureInitialized()
      await this.workflow?.reconcile(this._jobDataMap, trigger)
    })()
    try {
      await this.reconciliationPromise
    } finally {
      this.reconciliationPromise = null
    }
  }
  private async mountView(path?: string) {
    const routePath = path ?? this.gateway.path.value
    if (!isBossJobRoute(routePath)) {
      this.disposeView()
      return
    }

    if (document.querySelector('boss-helper-job')) return

    this.disposeView()

    const viewController = new AbortController()
    this.registerViewDisposer(() => viewController.abort())

    const elm = await waitForElement<HTMLElement>(
      '.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main',
      viewController.signal,
    )
    if (document.querySelector('boss-helper-job')) {
      this.disposeView()
      return
    }

    const appElement = createBossHelperJobElement(this)

    elm.insertBefore(appElement, elm.firstChild)
    this.registerViewDisposer(() => disposeBossHelperJobElement(appElement))
    this.registerViewDisposer(removeAd())

    try {
      await this.gateway.refresh()
      this.syncJobList()
      await this.reconcileWorkflow('view_mount').catch((error) => {
        logger.warn('工作流挂载恢复失败', error)
      })

      this.initNetConf()
      const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')

      this.registerViewDisposer(
        watch(
          appearanceConf.value,
          (value) => {
            if (!contentElm) return
            contentElm.style.marginRight =
              value.leftChat && value.contentOffset != 25 ? `${value.contentOffset}%` : 'unset'
            contentElm.style.marginLeft =
              !value.leftChat && value.contentOffset != 25 ? `${value.contentOffset}%` : 'unset'
          },
          { immediate: true },
        ),
      )
    } catch (error) {
      disposeBossHelperJobElement(appElement)
      this.disposeView()
      throw error
    }
  }

  private syncJobList() {
    this.jobList.value = this._jobList.value.map((item) => {
      const job = convertBossZpJobItemToJobData(item)
      if (this.conf.formData.useCache.value) {
        const cached = checkJobCache(job.key)
        if (cached) {
          this.jobResultMaps.set(job.key, {
            status: cached.status,
            msg: `${cached.message} (缓存)`,
          })
        }
      }

      const existingRawData = this._jobDataMap.get(job.key)
      const rawData = existingRawData
        ? { ...existingRawData, jobitem: item }
        : { jobitem: item, detail: createLazyObject<BoosJobData['detail']>('岗位详情获取') }
      this._jobDataMap.set(job.key, rawData)
      const existingWorkflowData = this.jobMaps.get(job.key)
      this.jobMaps.set(job.key, {
        jobData: job,
        rawData,
        state: existingWorkflowData?.state ?? {},
      })
      return job
    })
  }
}

export async function runBossHelper(gateway: BossPageGateway) {
  if (activeBossHelper) {
    logger.info('检测到内容脚本重连，交接工作流执行租约')
    await activeBossHelper.disposeForLifecycle('content_reconnect')
  }

  const bossHelpCtx = await BossHelperCtx.new(gateway)
  activeBossHelper = bossHelpCtx
  bossHelpCtx.registerDisposer(() => {
    if (activeBossHelper === bossHelpCtx) activeBossHelper = undefined
  })

  let mountScheduled = false
  const mountForRoute = (path: string) => {
    if (!isBossJobRoute(path)) {
      bossHelpCtx.disposeView()
      return
    }
    if (document.querySelector('boss-helper-job') || mountScheduled) return
    mountScheduled = true
    void bossHelpCtx
      .onMount(path)
      .catch((error) => {
        logger.error('页面切换初始化失败', error)
      })
      .finally(() => {
        mountScheduled = false
      })
  }
  const routeTimer = window.setInterval(() => mountForRoute(gateway.path.value), 250)
  const stopRouteWatch = watch(gateway.path, mountForRoute, { immediate: true })
  bossHelpCtx.registerDisposer(() => {
    stopRouteWatch()
    window.clearInterval(routeTimer)
  })

  const reconcileFromLifecycle = (trigger: string, event: Event) => {
    if (!event.isTrusted && !__BOSS_HELPER_TEST_OPEN_SHADOW__) return
    void bossHelpCtx.reconcileWorkflow(trigger).catch((error) => {
      logger.warn('页面生命周期恢复失败', error)
    })
  }
  const handleVisibility = (event: Event) => {
    if (document.visibilityState === 'visible') reconcileFromLifecycle('visibility', event)
  }
  const handlePageShow = (event: PageTransitionEvent) => reconcileFromLifecycle('pageshow', event)
  const handleFocus = (event: FocusEvent) => reconcileFromLifecycle('focus', event)
  const handleOnline = (event: Event) => reconcileFromLifecycle('online', event)
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('online', handleOnline)
  bossHelpCtx.registerDisposer(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('pageshow', handlePageShow)
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('online', handleOnline)
  })

  await run(bossHelpCtx)
}

export async function reconcileBossHelperRuntime(trigger: string) {
  await activeBossHelper?.reconcileWorkflow(trigger)
}

export async function disposeBossHelperRuntime(trigger: string) {
  const runtime = activeBossHelper
  activeBossHelper = undefined
  await runtime?.disposeForLifecycle(trigger)
}
