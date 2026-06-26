import { UserContent } from 'ai'
import { ref } from 'vue'

import { defineUnlistedScript } from '#imports'
import { appearanceConf } from '@/composables/conf'
import { GreetError } from '@/composables/useApplying/deliverError'
import { createLazyObject, WorkflowData } from '@/composables/useApplying/type'
import { HelperContext, JobData } from '@/composables/useHelper'
import { getRootVue, useHookVueData, useHookVueFn } from '@/composables/useVue'
import { initGeekChatBridge } from '@/composables/useWebSocket/chatCore'
import { Message } from '@/composables/useWebSocket/protobuf'
import {
  AI_REPLY_DOM_COMMAND_EVENT,
  AI_REPLY_DOM_COMMAND_RESULT_EVENT,
  type AiReplyCommandResult,
  type AiReplyDomCommand,
  type AiReplySendTarget,
} from '@/features/aiReply/types'
import { run } from '@/index'
import elmGetter from '@/utils/elmGetter'
import { logger } from '@/utils/logger'

import { BoosJobData, bossWorkflow } from './delivery'
import { requestBossData } from './requests'
import { BossZpDetailData, BossZpJobItemData } from './types'

function removeAd() {
  // 新职位发布时通知我
  void elmGetter.rm('.job-list-wrapper .subscribe-weixin-wrapper')
  // 侧栏
  void elmGetter.rm('.job-side-wrapper')
  // 侧边悬浮框
  void elmGetter.rm('.side-bar-box')
  // 搜索栏登录框
  void elmGetter.rm('.go-login-btn')
  // 底部页脚
  // elmGetter.rm("#footer-wrapper");

  // 新版: 微信扫码
  void elmGetter.rm('.c-subscribe-weixin')
  // 新版: 求职工具
  void elmGetter.rm('.c-job-tools.job-tools')
  // 新版: 热门职位
  void elmGetter.rm('.c-hot-link.hot-link')
  // 新版: 面包屑
  void elmGetter.rm('.c-breadcrumb')
}

const initChange = useHookVueFn('#wrap .page-job-wrapper', 'pageChangeAction')
const initSearch = useHookVueFn('#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main', [
  'searchJobAction',
  'onSearch',
])

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
    // return window?.Cookie.get('bst') // token ?
    return window._PAGE.encryptUserId
  }

  get userInfo() {
    return {
      id: window._PAGE.encryptUserId,
      name: window._PAGE.showName ?? window._PAGE.name,
      avatar: window._PAGE.largeAvatar ?? window._PAGE.tinyAvatar ?? '',
    }
  }

  static async new() {
    const ctx = new BossHelperCtx()
    ctx.rootVue = await getRootVue()
    ctx.workflow = await bossWorkflow(ctx)
    if (!ctx.uid) {
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

    const message = new Message({
      form_uid: String(window._PAGE.uid ?? window._PAGE.userId ?? this.uid),
      to_uid: String(bossData.data.bossId),
      to_name: bossData.data.encryptBossId,
      friend_source: bossData.data.bossSource,
      content,
    })

    await message.send()
    logger.info('消息发送成功', { jobKey, bossId: bossData.data.encryptBossId })
  }

  async onMount(path?: string) {
    if (!path) {
      path = this.rootVue.$route.path
    }
    // TODO: 移除menu, 可能导致nuxtui实例冲突
    // if (!document.querySelector('boss-helper-menu')) {
    //   const menuElement = document.createElement('boss-helper-menu')
    //   document.body.appendChild(menuElement)
    // }

    if (document.querySelector('boss-helper-job')) return

    const elm = await elmGetter.get(
      '.job-search-wrapper,.job-recommend-main,.page-jobs .page-jobs-main',
    )
    const appElement = document.createElement('boss-helper-job')

    elm.insertBefore(appElement, elm.firstChild)
    removeAd()

    await this._initPage()
    await this._initPageChange()
    await this._initJobDetail()
    await this._initClickJobCardAction()
    await this._initJobList()

    this.initNetConf()
    const contentElm = elm.querySelector<HTMLDivElement>('.recommend-result-inner')

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
    )
  }

  async _initJobList() {
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
    )()
  }

  async _initPage() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'pageVo',
      this._page,
    )()
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'hasMore',
      this._pageHasMore,
    )()
  }

  async _initJobDetail() {
    await useHookVueData(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'jobDetail',
      this._jobDetail,
    )()
  }

  async _initPageChange() {
    let pc =
      location.href.includes('/web/geek/job-recommend') || location.href.includes('/web/geek/jobs')
        ? await initSearch()
        : await initChange()
    if (!pc) {
      throw new Error('pageChange is undefined')
    }
    this._pageChange = pc
  }

  async _initClickJobCardAction() {
    this._clickJobCardAction = await useHookVueFn(
      '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
      'clickJobCardAction',
    )()
  }
}

function cloneForDom<T>(value: T): T {
  const cloneIntoFn = (globalThis as { cloneInto?: (value: T, target: Window) => T }).cloneInto
  return typeof cloneIntoFn === 'function' ? cloneIntoFn(value, window) : value
}

function dispatchAiReplyCommandResult(result: AiReplyCommandResult) {
  document.dispatchEvent(
    new CustomEvent(AI_REPLY_DOM_COMMAND_RESULT_EVENT, {
      detail: cloneForDom(result),
    }),
  )
}

async function sendAiReplyTarget(ctx: BossHelperCtx, target: AiReplySendTarget) {
  const content = target.text.trim()
  if (!content) {
    throw new Error('回复内容为空')
  }
  if (!target.toUid) {
    throw new Error('缺少 Boss/HR 用户 ID')
  }

  const message = new Message({
    form_uid: String(window._PAGE.uid ?? window._PAGE.userId ?? ctx.uid),
    to_uid: target.toUid,
    to_name: target.toName ?? '',
    friend_source: target.friendSource,
    content,
  })

  await message.send()
}

function initAiReplyDomCommands(ctx: BossHelperCtx) {
  document.addEventListener(AI_REPLY_DOM_COMMAND_EVENT, (event) => {
    const command = (event as CustomEvent<AiReplyDomCommand>).detail
    if (command?.type !== 'send-draft') {
      return
    }

    void sendAiReplyTarget(ctx, command.payload)
      .then(() => {
        dispatchAiReplyCommandResult({ requestId: command.requestId, ok: true })
      })
      .catch((error) => {
        logger.error('AI 回复草稿发送失败', error)
        dispatchAiReplyCommandResult({
          requestId: command.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  })
}

export default defineUnlistedScript(async () => {
  //   document.documentElement.classList.toggle(
  //     "dark",
  //     GM_getValue("theme-dark", false)
  //   );

  initGeekChatBridge()

  const bossHelpCtx = await BossHelperCtx.new()
  initAiReplyDomCommands(bossHelpCtx)

  bossHelpCtx.rootVue.$router.afterHooks.push(
    (to: {
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
      void bossHelpCtx.onMount(to.path).catch((e) => {
        logger.error('页面切换初始化失败', e)
      })
    },
  )

  await run(bossHelpCtx)
})
