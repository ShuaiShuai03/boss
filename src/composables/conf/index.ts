import { reactiveComputed, useStorageAsync, watchThrottled } from '@vueuse/core'
import { computed, reactive, ref, toRaw } from 'vue'

import type { InitializationStatus } from '@/composables/statisticsStore'
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
import { migrateFormData } from './migration'
import { formDataKeyForPreset, preparePresetSwitch } from './preset'
import {
  commitAfterPersistence,
  createConfSaveItems,
  createConfSavePayload,
} from './savePayload'

export * from './info'

const formDataPresetKey = 'local:FormDataPrese'
const formDataPresetsKey = 'local:FormDataPreses'
const CONF_SAVE_TIMEOUT_MS = 10000
const CONF_BRIDGE_TIMEOUT_MS = 1500

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
    // 控制室默认深色，浅色是同一套变量换值
    theme: 'dark' as 'dark' | 'light',
  },
  ExtStorage,
  { mergeDefaults: true },
)
/**
 * 控制室主题。面板和右上角菜单挂在两个不同的 shadow root 里，
 * 共用这里的取值，避免其中一个留在深色而另一个已经切到浅色。
 */
export const crTheme = computed<'dark' | 'light'>(() =>
  appearanceConf.value.theme === 'light' ? 'light' : 'dark',
)

export function toggleCrTheme() {
  appearanceConf.value.theme = crTheme.value === 'dark' ? 'light' : 'dark'
}

const initializationStatus = ref<InitializationStatus>('idle')
const initializationError = ref<string | null>(null)
const operationLoading = ref(false)
const isLoading = computed(() => initializationStatus.value === 'loading' || operationLoading.value)
const formData: FormData = reactive(createDefaultFormData())
const formDataPreset = ref('default')
const isSaving = ref(false)
let savingPromise: Promise<void> | null = null
let initializationPromise: Promise<void> | null = null
const persistedFormData = ref('')
const formDataPresets = ref([
  {
    label: '默认配置',
    value: 'default',
  },
])

const formDataKey = () => formDataKeyForPreset(formDataPreset.value)
const serializedFormData = computed(() => JSON.stringify(formData))
const isDirty = computed(
  () =>
    initializationStatus.value === 'ready' && serializedFormData.value !== persistedFormData.value,
)

function markCurrentFormDataSaved(savedFormData: FormData = formData) {
  persistedFormData.value = JSON.stringify(jsonClone(toRaw(savedFormData)))
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

export const useConf = () => {
  const toast = useToast()

  async function formDataHandler(from: Partial<FormData>) {
    return migrateFormData(from, defaultFormData)
  }

  async function loadPresetData(preset: string) {
    let from = await counter.storageGet<Partial<FormData>>(formDataKeyForPreset(preset), {})
    from = await formDataHandler(from)
    return deepmerge<FormData>(createDefaultFormData(), from)
  }

  async function init(force = false) {
    if (!force && initializationStatus.value === 'ready') return
    if (initializationPromise) return initializationPromise

    initializationStatus.value = 'loading'
    initializationError.value = null
    initializationPromise = (async () => {
      try {
        const rawFormDataPreset = await counter.storageGet(formDataPresetKey, 'default')
        const rawFormDataPresets = await counter.storageGet(formDataPresetsKey, [
          {
            label: '默认配置',
            value: 'default',
          },
        ])
        const selectedPreset = rawFormDataPresets.some(
          (preset) => preset.value === rawFormDataPreset,
        )
          ? rawFormDataPreset
          : 'default'
        const data = await loadPresetData(selectedPreset)

        formDataPreset.value = selectedPreset
        formDataPresets.value = rawFormDataPresets
        Object.assign(formData, data)
        markCurrentFormDataSaved(data)
        initializationStatus.value = 'ready'
      } catch (error) {
        initializationStatus.value = 'error'
        initializationError.value = error instanceof Error ? error.message : String(error)
        toast.add({
          title: `配置加载失败: ${initializationError.value}`,
          color: 'error',
        })
        logger.error('配置加载失败', error)
        throw error
      } finally {
        initializationPromise = null
      }
    })()

    return initializationPromise
  }

  async function ensureInitialized(force = false) {
    if (!force && initializationStatus.value === 'ready') return
    return init(force)
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
        await commitAfterPersistence(
          () =>
            withTimeout(
              counter.storageSetItems(
                createConfSaveItems(
                  payload,
                  formDataKeyForPreset(payload.formDataPreset),
                  formDataPresetsKey,
                  formDataPresetKey,
                ),
              ),
              CONF_SAVE_TIMEOUT_MS,
              '保存配置超时，请刷新当前 BOSS 页面后再试',
            ),
          () => {
            logger.debug('formData保存', summarizeFormDataForLog(payload.formData))
            markCurrentFormDataSaved(payload.formData)
            toast.add({
              title: '保存成功',
              color: 'success',
            })
          },
        )
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
    operationLoading.value = true
    try {
      const data = await loadPresetData(formDataPreset.value)
      Object.assign(formData, data)
      markCurrentFormDataSaved(data)
      logger.debug('formData已重新加载')
      toast.add({
        title: '重新加载成功',
        color: 'success',
      })
    } catch (error) {
      toast.add({
        title: `重新加载失败: ${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
      throw error
    } finally {
      operationLoading.value = false
    }
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
      title: '配置已导入，保存后生效',
      color: 'info',
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
      title: '推荐配置已应用，保存后生效',
      color: 'info',
    })
  }

  function confDelete() {
    deepmerge(formData, createDefaultFormData())
    logger.debug('formData已清空')
    toast.add({
      title: '配置已恢复默认值，保存后生效',
      color: 'info',
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
    operationLoading.value = true
    try {
      const value = Date.now().toString()
      const nextPresets = [
        ...formDataPresets.value,
        {
          label,
          value,
        },
      ]
      const payload = createConfSavePayload(formData, value, nextPresets)

      await counter.storageSetItems(
        createConfSaveItems(
          payload,
          formDataKeyForPreset(value),
          formDataPresetsKey,
          formDataPresetKey,
        ),
      )
      formDataPresets.value = nextPresets
      formDataPreset.value = value
      markCurrentFormDataSaved(payload.formData)

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
      operationLoading.value = false
    }
  }

  async function switchPreset(value: string) {
    if (value === formDataPreset.value) return true
    if (isDirty.value) {
      toast.add({
        title: '请先保存或重新加载当前配置，再切换预设',
        color: 'warning',
      })
      return false
    }
    operationLoading.value = true
    try {
      const data = await preparePresetSwitch({
        value,
        load: loadPresetData,
        persistSelection: (preset) => counter.storageSet(formDataPresetKey, preset),
      })
      formDataPreset.value = value
      Object.assign(formData, data)
      markCurrentFormDataSaved(data)
      return true
    } catch (e) {
      toast.add({
        title: `预设切换失败: ${String(e)}`,
        color: 'error',
      })
      logger.error('预设切换失败', e)
      return false
    } finally {
      operationLoading.value = false
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
    isSaving,
    isDirty,
    initializationStatus,
    initializationError,
    ensureInitialized,
  }
}
