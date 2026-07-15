import { UserContent } from 'ai'
import { ref } from 'vue'

import { appearanceConf } from '@/composables/conf'
import { GreetError } from '@/composables/useApplying/deliverError'
import { createLazyObject, WorkflowData } from '@/composables/useApplying/type'
import { HelperContext, JobData } from '@/composables/useHelper'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { Message } from '@/composables/useWebSocket/protobuf'
import type { AiReplySendTarget } from '@/features/aiReply/types'
import { createBossHelperJobElement, run } from '@/index'
import { resolveBossUser, waitForBossUser } from '@/utils/bossIdentity'
import { logger } from '@/utils/logger'

import { BoosJobData, bossWorkflow } from './delivery'
import { requestBossData } from './requests'
import { BossZpDetailData, BossZpJobItemData } from './types'

const runtimeSymbol = Symbol.for('boss-helper:runtime')

function viewDisposedError() {
  const error = new Error('页面资源已释放')
  error.name = 'AbortError'
  return error
}

function waitForElement<E extends Element>(selectors: string, signal: AbortSignal) {
  const existing = document.querySelector<E>(selectors)
  if (existing) return Promise.resolve(existing)

  return new Promise<E>((resolve, reject) => {
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
      observer.disconnect()
      signal.removeEventListener('abort', onAbort)
    }
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
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
  const observer = new MutationObserver(removeMatches)
  observer.observe(document.body, { childList: true, subtree: true })
  removeMatches()
  return () => observer.disconnect()
}

const initChange = useHookVueFn('#wrap .page-job-wrapper', 'pageChangeAction')
const initSearch = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', [
  'searchJobAction',
  'onSearch',
])

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

function convertBossZpJobItemToJobData(item: BossZpJobItemData): JobData {
  const key = `boss::${item.encryptJobId}`

  return {
    key,
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
  _page = ref({ page: 1, pageSize: 15 })
  _pageHasMore = ref(true)
  _jobDetail = ref<BossZpDetailData>()
  _pageChange = (_v: number) => {
    throw new Error('pageChange is undefined')
  }
  _clickJobCardAction = (_: BossZpJobItemData) => {}
  _jobList: Ref<BossZpJobItemData[]>
  _jobDataMap: Map<string, BoosJobData>

  rootVue: any = null
  jobMaps: Map<string, WorkflowData<BoosJobData, {}>>
  jobList: Ref<JobData[]>
  private mountPromise: Promise<void> | null = null
  private pendingMountPath: string | null = null
  private reconciliationPromise: Promise<void> | null = null

  constructor() {
    const jobList = ref<JobData[]>([])
    const _jobList = ref<BossZpJobItemData[]>([])
    const _jobListMap = new Map<string, BoosJobData>()

    super()

    this.jobList = jobList
    this._jobList = _jobList
    this._jobDataMap = _jobListMap

    this.jobMaps = reactive(new Map())
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
    return resolveBossUser(window._PAGE, this.rootVue?.$store?.state?.userInfo)
  }

  static async new() {
    const ctx = new BossHelperCtx()
    ctx.rootVue = await getRootVue()
    ctx.workflow = await bossWorkflow(ctx)
    const user = await waitForBossUser(() => [window._PAGE, ctx.rootVue?.$store?.state?.userInfo], {
      requireProtocolUserId: true,
    })
    if (!user.accountId || !user.protocolUserId) {
      useToast().add({
        color: 'error',
        title: '未获取到用户ID，可能会出现奇怪bug, 请尝试刷新页面或反馈',
      })
    }
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
      this._pageChange(oldPage + 1)
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
    if (!this.workflow) {
      this.workflow = await bossWorkflow(this)
    }
    await this.workflow.executeAll(this._jobDataMap)
  }

  async sendMessage(jobKey: string, msg: UserContent) {
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
      },
    )

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

    await message.send()
    logger.info('消息发送成功', { jobKey, bossId: bossData.data.encryptBossId })
  }

  async sendChatMessage(target: AiReplySendTarget) {
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

    await message.send()
    logger.info('聊天消息发送成功', { conversationId: target.conversationId, toUid: target.toUid })
  }

  async onMount(path?: string) {
    this.pendingMountPath = path ?? String(this.rootVue.$route.path ?? '')
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
    const routePath = path ?? String(this.rootVue.$route.path ?? '')
    if (!isBossJobRoute(routePath)) {
      this.disposeView()
      return
    }
    // TODO: 移除menu, 可能导致nuxtui实例冲突
    // if (!document.querySelector('boss-helper-menu')) {
    //   const menuElement = document.createElement('boss-helper-menu')
    //   document.body.appendChild(menuElement)
    // }

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
    this.registerViewDisposer(removeAd())

    try {
      await this._initPage(viewController.signal)
      await this._initPageChange(viewController.signal)
      await this._initJobDetail(viewController.signal)
      await this._initClickJobCardAction(viewController.signal)
      await this._initJobList(viewController.signal)
      await this.reconcileWorkflow('view_mount')

      this.initNetConf()
      const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')

      this.registerViewDisposer(
        watch(
          appearanceConf.value,
          (v) => {
            if (!contentElm) return
            contentElm.style.marginRight =
              v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'unset'
            contentElm.style.marginLeft =
              !v.leftChat && v.contentOffset != 25 ? `${v.contentOffset}%` : 'unset'
          },
          { immediate: true },
        ),
      )
    } catch (error) {
      appElement.remove()
      this.disposeView()
      throw error
    }
  }

  async _initJobList(signal?: AbortSignal) {
    this.registerViewDisposer(
      await useHookVueData(
        '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
        'jobList',
        this._jobList,
        (v) => {
          this.jobList.value = v.map((item) => {
            // const jobData = convertBossZpJobItemToJobData(item)
            // if (this.conf.formData.useCache.value) {
            //   const cacheCheck = checkJobCache(jobData.key)
            //   if (cacheCheck) {
            //     jobData.status = {
            //       status: cacheCheck.status,
            //       msg: `${cacheCheck.message} (缓存)`,
            //     }
            //   }
            // }
            const job = convertBossZpJobItemToJobData(item)

            let jobData = this._jobDataMap.get(job.key)
            if (jobData) {
              jobData = {
                ...jobData,
                jobitem: item,
              }
            } else {
              jobData = {
                jobitem: item,
                detail: createLazyObject('岗位详情获取'),
              }
            }
            this._jobDataMap.set(job.key, jobData)

            return job
          })
          this.jobList.value.forEach((job) => {
            this.jobMaps.set(job.key, {
              jobData: job,
              rawData: this._jobDataMap.get(job.key)!,
              state: {},
            })
          })
        },
      )(signal),
    )
  }

  async _initPage(signal?: AbortSignal) {
    this.registerViewDisposer(
      await useHookVueData(
        '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
        'pageVo',
        this._page,
      )(signal),
    )
    this.registerViewDisposer(
      await useHookVueData(
        '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
        'hasMore',
        this._pageHasMore,
      )(signal),
    )
  }

  async _initJobDetail(signal?: AbortSignal) {
    this.registerViewDisposer(
      await useHookVueData(
        '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
        'jobDetail',
        this._jobDetail,
      )(signal),
    )
  }

  async _initPageChange(signal?: AbortSignal) {
    let pc =
      location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')
        ? await initSearch(signal)
        : await initChange(signal)
    if (!pc) {
      throw new Error('pageChange is undefined')
    }
    this._pageChange = pc
  }

  async _initClickJobCardAction(signal?: AbortSignal) {
    this._clickJobCardAction = await useHookVueFn(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'clickJobCardAction',
    )(signal)
  }
}

export async function runBossHelper() {
  //   document.documentElement.classList.toggle(
  //     "dark",
  //     GM_getValue("theme-dark", false)
  //   );

  const runtimeWindow = window as typeof window & Record<symbol, BossHelperCtx | undefined>
  const previousRuntime = runtimeWindow[runtimeSymbol]
  if (previousRuntime) {
    logger.info('检测到内容脚本重连，交接工作流执行租约')
    await previousRuntime.disposeForLifecycle('content_reconnect')
    document.querySelector('boss-helper-job')?.remove()
  }

  const bossHelpCtx = await BossHelperCtx.new()
  runtimeWindow[runtimeSymbol] = bossHelpCtx
  bossHelpCtx.registerDisposer(() => {
    if (runtimeWindow[runtimeSymbol] === bossHelpCtx) delete runtimeWindow[runtimeSymbol]
  })

  let pendingRouteObserver: MutationObserver | null = null
  const mountForRoute = (path: string) => {
    pendingRouteObserver?.disconnect()
    pendingRouteObserver = null
    const existingHost = document.querySelector('boss-helper-job')
    if (!isBossJobRoute(path)) {
      existingHost?.remove()
      bossHelpCtx.disposeView()
      return
    }
    if (!existingHost) {
      void bossHelpCtx.onMount(path).catch((e) => {
        logger.error('页面切换初始化失败', e)
      })
      return
    }

    const remountWhenDisconnected = () => {
      if (existingHost.isConnected) return
      pendingRouteObserver?.disconnect()
      pendingRouteObserver = null
      void bossHelpCtx.onMount(path).catch((e) => {
        logger.error('页面切换初始化失败', e)
      })
    }
    pendingRouteObserver = new MutationObserver(remountWhenDisconnected)
    pendingRouteObserver.observe(document.documentElement, { childList: true, subtree: true })
    queueMicrotask(remountWhenDisconnected)
  }
  const routeHook = (to: {
    name: string
    meta: {
      notLogin: boolean
      wrapClassName: string
      scrollBehavior: string
      hideFooter: boolean
      headerV2: boolean
    }
    path: string
    hash: string
    query: {
      ka: string
    }
    params: {}
    fullPath: string
  }) => {
    mountForRoute(to.path)
  }
  bossHelpCtx.rootVue.$router.afterHooks.push(routeHook)
  bossHelpCtx.registerDisposer(() => {
    pendingRouteObserver?.disconnect()
    pendingRouteObserver = null
    const index = bossHelpCtx.rootVue.$router.afterHooks.indexOf(routeHook)
    if (index >= 0) bossHelpCtx.rootVue.$router.afterHooks.splice(index, 1)
  })

  const reconcileFromLifecycle = (trigger: string) => {
    void bossHelpCtx.reconcileWorkflow(trigger).catch((error) => {
      logger.warn('页面生命周期恢复失败', error)
    })
  }
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') reconcileFromLifecycle('visibility')
  }
  const handlePageShow = () => reconcileFromLifecycle('pageshow')
  const handleFocus = () => reconcileFromLifecycle('focus')
  const handleOnline = () => reconcileFromLifecycle('online')
  const handleWatchdog = () => reconcileFromLifecycle('watchdog')
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pageshow', handlePageShow)
  window.addEventListener('focus', handleFocus)
  window.addEventListener('online', handleOnline)
  document.addEventListener('boss-helper:workflow-watchdog', handleWatchdog)
  bossHelpCtx.registerDisposer(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('pageshow', handlePageShow)
    window.removeEventListener('focus', handleFocus)
    window.removeEventListener('online', handleOnline)
    document.removeEventListener('boss-helper:workflow-watchdog', handleWatchdog)
  })

  await run(bossHelpCtx)
}
