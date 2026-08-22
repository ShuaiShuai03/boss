import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'
import { extendRef } from '@vueuse/core'
import { UserContent } from 'ai'
import { computed, Reactive, ref, Ref, watch } from 'vue'

import { useConf } from '@/composables/conf'
import { createInitializationGate } from '@/composables/initializationGate'
import { DeliveryWorkflow } from '@/composables/useApplying'
import type { BossHelperError } from '@/composables/useApplying/deliverError'
import { TaskResult, WorkflowData } from '@/composables/useApplying/type'
import { useModel } from '@/composables/useModel'
import { ChatModel } from '@/composables/useModel/test'
import { createExtensionStatisticsStore } from '@/composables/useStatistics'
import type { AiReplySendTarget } from '@/features/aiReply/types'
import { logger } from '@/utils/logger'

import { initNetConf, NetConf } from './netConf'
import { Log, JobData, LogData } from './type'
const MAX_LOG_ENTRIES = 500

export abstract class HelperContext<C extends HelperContext<C, T, S>, T, S> {
  netConf: Ref<NetConf | null>
  conf: ReturnType<typeof useConf>
  models: ReturnType<typeof useModel>
  statistics: ReturnType<typeof createExtensionStatisticsStore>
  private initializationGate = createInitializationGate(async (force) => {
    await Promise.all([
      this.conf.ensureInitialized(force),
      this.models.ensureInitialized(force),
      this.statistics.initialize(force),
    ])
  })
  initializationStatus = this.initializationGate.initializationStatus
  initializationError = this.initializationGate.initializationError
  initializationReady = computed(() => this.initializationStatus.value === 'ready')

  private viewDisposers = new Set<() => void>()
  private disposers = new Set<() => void>()
  private disposed = false

  chatModel: ChatModel
  workflow: DeliveryWorkflow<C, T, S> | null = null
  workflowRunning = computed(
    () => this.workflow?.status.value === 'running' || this.workflow?.status.value === 'recovering',
  )
  jobResultMaps: Reactive<Map<string, TaskResult>>

  abstract jobList: Ref<JobData[]>
  currentJob: Ref<string | null>
  abstract jobMaps: Map<string, WorkflowData<T, S>>

  _logs: Ref<Log[]>
  logs: {
    add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => void
    info: (title: string, message: string) => void
    clear: () => void
    value: Log[]
  }

  constructor() {
    this.conf = useConf()
    this.models = useModel()
    this.statistics = createExtensionStatisticsStore()
    this.currentJob = ref(null)
    this._logs = ref([])
    const stopLogCap = watch(
      this._logs,
      (logs) => {
        if (logs.length > MAX_LOG_ENTRIES) {
          logs.splice(0, logs.length - MAX_LOG_ENTRIES)
        }
      },
      { deep: true, flush: 'sync' },
    )
    this.registerDisposer(stopLogCap)
    this.logs = extendRef(this._logs, {
      add: (job: JobData, err?: BossHelperError, logdata?: LogData, msg?: string) => {
        const state = !err ? 'success' : err.state
        const message = msg ?? (err ? err.message : undefined)
        this._logs.value.push({
          job,
          time: new Date().toLocaleString(),
          title: job.jobName,
          state,
          state_name: err?.name ?? '投递成功',
          message,
          data: logdata,
        })
      },
      info: (title: string, message: string) => {
        this._logs.value.push({
          time: new Date().toLocaleString(),
          title,
          state: 'info',
          state_name: '消息',
          message,
          data: undefined,
        })
      },
      clear: () => {
        this._logs.value = []
      },
    })

    this.chatModel = new ChatModel(this)

    this.jobResultMaps = reactive(new Map())
    this.netConf = ref(null)
  }

  abstract loadMoreJob(delay: Promise<any>): Promise<boolean>
  abstract onMount(): Promise<void>
  abstract start(): Promise<void>
  abstract sendMessage(jobKey: string, msg: UserContent, signal?: AbortSignal): Promise<void>
  abstract sendChatMessage(target: AiReplySendTarget, signal?: AbortSignal): Promise<void>
  abstract get uid(): string
  abstract get protocolUserId(): string
  abstract get userInfo(): {
    id: string
    name: string
    avatar: string
  }

  async ensureInitialized(force = false) {
    return this.initializationGate.ensureInitialized(force)
  }

  registerViewDisposer(disposer: (() => void) | undefined) {
    if (disposer) this.viewDisposers.add(disposer)
    return disposer
  }

  disposeView() {
    for (const disposer of this.viewDisposers) {
      try {
        disposer()
      } catch (error) {
        logger.warn('页面资源释放失败', error)
      }
    }
    this.viewDisposers.clear()
  }

  async suspendView(trigger = 'view_disconnected') {
    this.disposeView()
    await this.workflow?.suspendForLifecycle(trigger)
  }

  registerDisposer(disposer: () => void) {
    this.disposers.add(disposer)
    return disposer
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.disposeView()
    this.statistics.dispose()
    for (const disposer of this.disposers) {
      try {
        disposer()
      } catch (error) {
        logger.warn('全局资源释放失败', error)
      }
    }
    this.disposers.clear()
  }

  async disposeForLifecycle(trigger = 'page_lifecycle') {
    if (this.disposed) return
    await this.workflow?.suspendForLifecycle(trigger)
    this.disposed = true
    this.disposeView()
    this.statistics.dispose()
    for (const disposer of this.disposers) {
      try {
        disposer()
      } catch (error) {
        logger.warn('全局资源释放失败', error)
      }
    }
    this.disposers.clear()
  }

  initNetConf() {
    void initNetConf()
      .then((data) => {
        this.netConf.value = data ?? null
      })
      .catch((error) => {
        logger.warn('网络配置初始化失败', error)
      })
  }

  stop() {
    this.workflow?.stop()
  }
  reset() {
    this.workflow?.reset()
  }
  async notification(
    msg: string,
    opt?: {
      notification?: typeof notification extends (
        message: string,
        options?: infer O,
      ) => Promise<any>
        ? O
        : never
      toast: Partial<Toast>
    },
  ) {
    const toast = useToast()
    if (this.conf.formData.notification.value && document.visibilityState !== 'visible') {
      await notification(msg, opt?.notification)
    }
    toast.add({
      ...opt?.toast,
      title: msg,
    })
  }
}
