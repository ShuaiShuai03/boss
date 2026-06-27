import { reactiveComputed, useStorageAsync, watchThrottled } from '@vueuse/core'
import { reactive, ref, toRaw } from 'vue'

import { counter } from '@/message'
import { ExtStorage } from '@/message'
import type { ConfigLevel, FormData } from '@/types/formData'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import {
  EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextInvalidated,
} from '@/utils/extension'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { logger } from '@/utils/logger'
import { TimeoutError, withTimeout } from '@/utils/promise'

import { defaultFormData } from './info'
import { createConfSavePayload } from './savePayload'

export * from './info'

const formDataPresetKey = 'local:FormDataPrese'
const formDataPresetsKey = 'local:FormDataPreses'
const CONF_SAVE_TIMEOUT_MS = 10000
const CONF_BRIDGE_TIMEOUT_MS = 1500

const LEGACY_AI_REPLY_PROMPT = [
  {
    role: 'system',
    content: `你是 [求职者姓名] 的 Boss 直聘聊天助手。根据岗位信息和 HR 消息生成一条自然、礼貌、简洁、可直接发送的中文回复。

使用前请替换的求职者背景：
- 姓名或称呼：[求职者姓名]
- 学历与专业：[最高学历/专业背景]
- 当前状态：[所在城市/在职状态/到岗时间]
- 目标方向：[目标岗位方向 1]、[目标岗位方向 2]、[目标岗位方向 3]
- 关键能力：[核心技能 1]、[核心技能 2]、[核心技能 3]、[核心工具或平台]
- 代表项目：[项目 A]、[项目 B]、[项目 C]
- 工作经历：[与目标岗位相关的工作经历或可迁移能力]

回复要求：
- 只输出可以直接发送给 HR/BOSS 的回复，不要解释、不要标题、不要 Markdown。
- 默认 1 到 3 句，语气真诚、稳重、不过度自夸。
- 根据 HR 的问题回答：问自我介绍就突出最相关项目；问到岗时间就依据 [在职状态/到岗时间] 回答；问匹配度就结合岗位关键词说明 1 到 2 个证据；问是否考虑地点/薪资/面试就按 [地点/薪资/面试偏好] 礼貌表达。
- 不要主动输出电话、邮箱、GitHub 链接，除非 HR 明确要求联系方式或作品链接。
- 不要编造未提供的学历、公司、薪资、年限、获奖、论文或实习经历。
- 如果 HR 消息信息不足，给出礼貌承接并主动索要岗位重点或面试安排。`,
  },
  {
    role: 'user',
    content: `## 岗位信息
岗位名: {{ jobData.jobName }}
公司: {{ jobData.brand.name }}
薪资: {{ jobData.salary }}
学历要求: {{ jobData.degreeName }}
岗位描述:
{{ jobData.jobDescription }}

## HR消息或上下文
{{ state.aiReplyInput }}`,
  },
]

function isLegacyAiReplyPrompt(prompt: unknown) {
  return JSON.stringify(prompt) === JSON.stringify(LEGACY_AI_REPLY_PROMPT)
}

function createDefaultFormData() {
  return jsonClone(defaultFormData)
}

async function assertContentBridgeReady() {
  await withTimeout(
    counter.contentScriptTest('success'),
    CONF_BRIDGE_TIMEOUT_MS,
    EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
  )
}

export const appearanceConf = useStorageAsync(
  'appearance-conf',
  {
    hideHeader: false,
    changeIcon: false,
    dynamicTitle: false,
    changeBackground: false,
    blurCard: false,
    listSink: false,
    contentOffset: 25, // 0-25, 25则为关闭
    leftChat: false,
    chatBoxWidth: 600,
    defaultShowChatBox: false,
  },
  ExtStorage,
  { mergeDefaults: true },
)
const isLoading = ref(true)
const formData: FormData = reactive(createDefaultFormData())
const formDataPreset = ref('default')
const isSaving = ref(false)
let savingPromise: Promise<void> | null = null
const formDataPresets = ref([
  {
    label: '默认配置',
    value: 'default',
  },
])

const formDataKey = () => {
  if (formDataPreset.value !== 'default') {
    return `local:web-geek-job-FormData-${formDataPreset.value}`
  }
  return 'local:web-geek-job-FormData'
}

function summarizeFormDataForLog(value: FormData) {
  return {
    version: value.version,
    configLevel: value.configLevel,
    autoApplyEnabled: value.autoApplyEnabled.value,
    autoGreetingEnabled: value.autoGreetingEnabled.value,
    aiFiltering: {
      enable: value.aiFiltering.enable,
      model: value.aiFiltering.model,
      promptMessages: value.aiFiltering.prompt.length,
    },
    aiGreeting: {
      enable: value.aiGreeting.enable,
      model: value.aiGreeting.model,
      promptMessages: value.aiGreeting.prompt.length,
    },
    aiReply: {
      enable: value.aiReply.enable,
      model: value.aiReply.model,
      promptMessages: value.aiReply.prompt.length,
    },
  }
}

watchThrottled(
  formData,
  (v) => {
    logger.debug('formData改变', summarizeFormDataForLog(toRaw(v)))
  },
  { throttle: 2000 },
)

const FROM_VERSION: [string, (from: Partial<FormData>) => Partial<FormData>][] = [
  [
    '20250826',
    (from) => {
      if (from.salaryRange && typeof from.salaryRange.value === 'string') {
        const [min, max] = (from.salaryRange.value as string).split('-').map(Number)
        from.salaryRange.value = [min, max, false]
      }
      if (from.companySizeRange && typeof from.companySizeRange.value === 'string') {
        const [min, max] = (from.companySizeRange.value as string).split('-').map(Number)
        from.companySizeRange.value = [min, max, false]
      }
      return from
    },
  ],
  [
    '20260521',
    (from) => {
      if (from.aiFiltering?.prompt) {
        if (typeof from.aiFiltering.prompt === 'string') {
          from.aiFiltering.prompt = [
            {
              role: 'user',
              content: from.aiFiltering.prompt,
            },
          ]
        }
      } else {
        from.aiFiltering = {
          ...defaultFormData.aiFiltering,
          ...from.aiFiltering,
          prompt: jsonClone(defaultFormData.aiFiltering.prompt),
        }
      }
      if (from.aiGreeting?.prompt) {
        if (typeof from.aiGreeting.prompt === 'string') {
          from.aiGreeting.prompt = [
            {
              role: 'user',
              content: from.aiGreeting.prompt,
            },
          ]
        }
      } else {
        from.aiGreeting = {
          ...defaultFormData.aiGreeting,
          ...from.aiGreeting,
          prompt: jsonClone(defaultFormData.aiGreeting.prompt),
        }
      }
      if (from.jobAddress) {
        from.jobAddress = {
          ...from.jobAddress,
          include: true,
        }
      }
      return from
    },
  ],
]

export const useConf = () => {
  const toast = useToast()

  async function formDataHandler(from: Partial<FormData>) {
    try {
      for (let i = FROM_VERSION.length - 1; i >= 0; i--) {
        const [version, fn] = FROM_VERSION[i]
        if ((from?.version ?? '20240401') >= version) {
          break
        }
        from = fn(from)
        from.version = version
      }
    } catch (err) {
      logger.error('用户配置初始化失败', err)
      toast.add({
        title: `用户配置初始化失败: ${String(err)}`,
        color: 'error',
      })
    }
    if (!from.aiReply?.prompt || isLegacyAiReplyPrompt(from.aiReply.prompt)) {
      from.aiReply = {
        ...defaultFormData.aiReply,
        ...from.aiReply,
        prompt: jsonClone(defaultFormData.aiReply.prompt),
      }
    }
    from.dailyLimit ??= {
      value: from.deliveryLimit?.value ?? defaultFormData.dailyLimit.value,
    }
    from.autoApplyEnabled ??= jsonClone(defaultFormData.autoApplyEnabled)
    from.autoGreetingEnabled ??= jsonClone(defaultFormData.autoGreetingEnabled)
    from.actionDelayMs ??= jsonClone(defaultFormData.actionDelayMs)
    from.maxConsecutiveFailures ??= jsonClone(defaultFormData.maxConsecutiveFailures)
    return from
  }

  async function init() {
    isLoading.value = true
    try {
      const rawFormDataPreset = await counter.storageGet(formDataPresetKey, 'default')
      const rawFormDataPresets = await counter.storageGet(formDataPresetsKey, [
        {
          label: '默认配置',
          value: 'default',
        },
      ])
      formDataPreset.value = rawFormDataPreset
      formDataPresets.value = rawFormDataPresets

      let from = await counter.storageGet<Partial<FormData>>(formDataKey(), {})
      from = (await formDataHandler(from)) ?? from
      const data = deepmerge<FormData>(createDefaultFormData(), from)
      Object.assign(formData, data)
    } catch (e) {
      toast.add({
        title: `配置加载失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('配置加载失败', e)
    } finally {
      isLoading.value = false
    }
  }

  async function confSaving() {
    if (savingPromise) {
      return savingPromise
    }
    isSaving.value = true
    savingPromise = (async () => {
      const payload = createConfSavePayload(formData, formDataPreset.value, formDataPresets.value)
      try {
        await assertContentBridgeReady()
        await withTimeout(
          (async () => {
            await counter.storageSet(formDataKey(), payload.formData)
            await counter.storageSet(formDataPresetKey, payload.formDataPreset)
            await counter.storageSet(formDataPresetsKey, payload.formDataPresets)
          })(),
          CONF_SAVE_TIMEOUT_MS,
          '保存配置超时，请刷新当前 BOSS 页面后再试',
        )

        logger.debug('formData保存', summarizeFormDataForLog(payload.formData))
        toast.add({
          title: '保存成功',
          color: 'success',
        })
      } catch (error: any) {
        const title =
          error instanceof TimeoutError
            ? error.message
            : isExtensionContextInvalidated(error)
              ? EXTENSION_CONTEXT_INVALIDATED_MESSAGE
              : `保存失败: ${error.message}`
        toast.add({
          title,
          color: 'error',
        })
        throw error
      } finally {
        isSaving.value = false
        savingPromise = null
      }
    })()
    // const helper = useHelper()
    // helper.workflow?.rebuild()
    return savingPromise
  }

  async function confReload() {
    const v = deepmerge<FormData>(
      createDefaultFormData(),
      await counter.storageGet(formDataKey(), {}),
    )
    deepmerge(formData, v, { clone: false })
    logger.debug('formData已重置')
    toast.add({
      title: '重置成功',
      color: 'success',
    })
  }

  async function confExport() {
    const data = deepmerge<FormData>(
      createDefaultFormData(),
      await counter.storageGet(formDataKey(), {}),
    )
    exportJson(data, '打招呼配置')
  }

  async function confImport() {
    let jsonData = await importJson<Partial<FormData>>()
    jsonData = (await formDataHandler(jsonData)) ?? jsonData
    deepmerge(formData, jsonData, { clone: false })
    toast.add({
      title: '导入成功, 切记要手动保存哦',
      color: 'success',
    })
  }

  function confRecommend() {
    deepmerge(
      formData,
      [
        'deliveryLimit',
        'autoApplyEnabled',
        'autoGreetingEnabled',
        'actionDelayMs',
        'maxConsecutiveFailures',
        'activityFilter',
        'friendStatus',
        'sameCompanyFilter',
        'sameHrFilter',
        'goldHunterFilter',
        'notification',
        'useCache',
        'delay',
      ].reduce(
        (result, key) => {
          result[key] = jsonClone(defaultFormData[key as keyof FormData])
          return result
        },
        {} as Record<string, any>,
      ),
    )
    logger.debug('formData推荐配置已应用')
    toast.add({
      title: '推荐配置已应用, 不会自动保存, 请手动保存或重载恢复',
      color: 'success',
    })
  }

  function confDelete() {
    deepmerge(formData, createDefaultFormData())
    logger.debug('formData已清空')
    toast.add({
      title: '配置清空成功, 不会自动保存, 请手动保存或重载恢复',
      color: 'success',
    })
  }

  const order: Record<ConfigLevel, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
    expert: 4,
  }

  const configLevel = reactiveComputed(() => {
    const val = order[formData.configLevel]
    return {
      intermediate: order['intermediate'] <= val,
      advanced: order['advanced'] <= val,
      expert: order['expert'] <= val,
    }
  })

  async function createPreset(label: string) {
    isLoading.value = true
    try {
      const value = Date.now().toString()
      formDataPresets.value.push({
        label,
        value,
      })
      formDataPreset.value = value
      const payload = createConfSavePayload(formData, formDataPreset.value, formDataPresets.value)

      await counter.storageSet(formDataPresetKey, payload.formDataPreset)
      await counter.storageSet(formDataPresetsKey, payload.formDataPresets)
      await counter.storageSet(formDataKey(), payload.formData)

      toast.add({
        title: '预设创建成功',
        color: 'success',
      })
    } catch (e) {
      toast.add({
        title: `预设创建失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设创建失败', e)
    } finally {
      isLoading.value = false
    }
  }

  async function switchPreset(value: string) {
    isLoading.value = true
    try {
      formDataPreset.value = value
      await counter.storageSet(formDataPresetKey, value)
      await init()
    } catch (e) {
      toast.add({
        title: `预设切换失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设切换失败', e)
    } finally {
      isLoading.value = false
    }
  }

  return {
    confInit: init,
    confSaving,
    confReload,
    confExport,
    confImport,
    confDelete,
    confRecommend,
    formDataKey,
    defaultFormData,
    formData,
    configLevel,
    formDataPreset,
    formDataPresets,
    createPreset,
    switchPreset,
    isLoading,
  }
}
