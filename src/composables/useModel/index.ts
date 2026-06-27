import { ref, toRaw } from 'vue'

import { counter } from '@/message'
import { logger } from '@/utils/logger'

import type { OpenaiLLMConf } from './openai'
import { openai } from './openai'
import { normalizeOpenaiConfig } from './openai-utils'
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
const isLoading = ref(true)
const isSaving = ref(false)

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

function normalizeModelConf(model: ModelConf): ModelConf {
  if (!model.data) return model
  return {
    ...model,
    data: normalizeOpenaiConfig(model.data),
  }
}

export const useModel = () => {
  async function init() {
    isLoading.value = true
    try {
      const localData = await counter.storageGet<ModelConf[] | null>(confModelKey, null)
      if (Array.isArray(localData)) {
        logger.debug('ai模型数据', localData.map(summarizeModelConfForLog))
        modelData.value = localData.map(normalizeModelConf)
        return
      }

      const legacyData = await counter.storageGet<ModelConf[] | null>(legacyConfModelKey, null)
      if (Array.isArray(legacyData)) {
        const migrated = legacyData.map(normalizeModelConf)
        await counter.storageSet(confModelKey, migrated)
        logger.debug('ai模型数据已迁移到 local', migrated.map(summarizeModelConfForLog))
        modelData.value = migrated
        return
      }

      modelData.value = []
    } catch (error) {
      logger.error('AI 模型配置加载失败', error)
      toast.add({
        title: `AI 模型配置加载失败: ${error instanceof Error ? error.message : String(error)}`,
        color: 'error',
      })
      modelData.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function save() {
    isSaving.value = true
    try {
      const data = toRaw(modelData.value).map(normalizeModelConf)
      modelData.value = data
      await counter.storageSet(confModelKey, data)
      toast.add({
        title: '保存成功',
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

  return {
    initModel: init,
    modelData,
    saveModel: save,
    isLoading,
    isSaving,
  }
}
