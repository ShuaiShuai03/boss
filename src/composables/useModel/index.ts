import { computed, ref, toRaw } from 'vue'

import { counter } from '@/message'
import { logger } from '@/utils/logger'
import type { InitializationStatus } from '@/composables/statisticsStore'

import type { OpenaiLLMConf } from './openai'
import { openai } from './openai'
import { normalizeOpenaiConfig } from './openai-utils'
import { mutateAndPersistModelData, normalizeStoredModelData } from './persistence'
import './test'

const toast = useToast()
export const confModelKey = 'local:conf-model'
const legacyConfModelKey = 'conf-model'
export const llms = [openai.info]

export type ModelConfData = OpenaiLLMConf

export interface ModelConf {
  key: string
  name: string
  color?: string
  data?: ModelConfData
  // vip?: {
  //   description: string
  //   price: {
  //     input: string
  //     output: string
  //   }
  // }
}
const modelData = ref<ModelConf[]>([])
const initializationStatus = ref<InitializationStatus>('idle')
const initializationError = ref<string | null>(null)
const isLoading = computed(() => initializationStatus.value === 'loading')
const isSaving = ref(false)
let initializationPromise: Promise<void> | null = null

function summarizeModelConfForLog(model: ModelConf) {
  return {
    key: model.key,
    name: model.name,
    mode: model.data?.mode,
    base_url: model.data?.base_url,
    model: model.data?.model,
    has_api_key: Boolean(model.data?.api_key),
    extra_header_keys: Object.keys(model.data?.advanced?.extra_headers ?? {}),
  }
}

function normalizeModelConf(model: unknown): ModelConf {
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new Error('模型配置项不是有效对象')
  }
  const candidate = model as Partial<ModelConf>
  if (!candidate.key || typeof candidate.key !== 'string' || typeof candidate.name !== 'string') {
    throw new Error('模型配置项缺少有效的 key 或 name')
  }
  if (candidate.data !== undefined && (!candidate.data || typeof candidate.data !== 'object')) {
    throw new Error(`模型 ${candidate.name} 的配置不是有效对象`)
  }
  const validModel = candidate as ModelConf
  if (!validModel.data) return validModel
  const { url: legacyUrl, ...data } = validModel.data as Record<string, unknown>
  return {
    ...validModel,
    data: normalizeOpenaiConfig({
      ...data,
      base_url: data.base_url ?? legacyUrl,
    }) as ModelConf['data'],
  }
}

export const useModel = () => {
  async function init(force = false) {
    if (!force && initializationStatus.value === 'ready') return
    if (initializationPromise) return initializationPromise

    initializationStatus.value = 'loading'
    initializationError.value = null
    initializationPromise = (async () => {
      try {
        const localData = await counter.storageGet<unknown>(confModelKey, null)
        const localModels = normalizeStoredModelData(localData, '本地 AI 模型配置', normalizeModelConf)
        if (localModels) {
          await counter.storageRm(legacyConfModelKey)
          logger.debug('ai模型数据', localModels.map(summarizeModelConfForLog))
          modelData.value = localModels
          initializationStatus.value = 'ready'
          return
        }

        const legacyData = await counter.storageGet<unknown>(legacyConfModelKey, null)
        const migrated = normalizeStoredModelData(
          legacyData,
          '旧版 AI 模型配置',
          normalizeModelConf,
        )
        if (migrated) {
          await counter.storageSet(confModelKey, migrated)
          await counter.storageRm(legacyConfModelKey)
          logger.debug('ai模型数据已迁移到 local', migrated.map(summarizeModelConfForLog))
          modelData.value = migrated
          initializationStatus.value = 'ready'
          return
        }

        modelData.value = []
        initializationStatus.value = 'ready'
      } catch (error) {
        initializationStatus.value = 'error'
        initializationError.value = error instanceof Error ? error.message : String(error)
        logger.error('AI 模型配置加载失败', error)
        toast.add({
          title: `AI 模型配置加载失败: ${initializationError.value}`,
          color: 'error',
        })
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

  async function save(successTitle = '模型配置已保存') {
    isSaving.value = true
    try {
      const data = toRaw(modelData.value).map(normalizeModelConf)
      modelData.value = data
      await counter.storageSet(confModelKey, data)
      toast.add({
        title: successTitle,
        color: 'success',
      })
    } catch (error) {
      toast.add({
        title: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
      throw error
    } finally {
      isSaving.value = false
    }
  }

  async function mutateAndSave(
    mutation: (models: ModelConf[]) => void,
    successTitle: string,
  ) {
    isSaving.value = true
    try {
      await mutateAndPersistModelData({
        models: modelData.value,
        mutation,
        prepare: (models) => toRaw(models).map(normalizeModelConf),
        persist: (models) => counter.storageSet(confModelKey, models),
        replace: (models) => {
          modelData.value = models
        },
        onSuccess: () => {
          toast.add({
            title: successTitle,
            color: 'success',
          })
        },
      })
    } catch (error) {
      toast.add({
        title: `保存失败: ${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
      throw error
    } finally {
      isSaving.value = false
    }
  }

  return {
    initModel: init,
    modelData,
    saveModel: save,
    mutateAndSave,
    isLoading,
    isSaving,
    initializationStatus,
    initializationError,
    ensureInitialized,
  }
}
