import { storage, type StorageItemKey } from '#imports'
import { defaultFormData } from '@/composables/conf/info'
import type { ModelConf } from '@/composables/useModel'
import type { FormData } from '@/types/formData'
import deepmerge from '@/utils/deepmerge'

const formDataPresetKey = 'local:FormDataPrese'
const defaultFormDataKey: StorageItemKey = 'local:web-geek-job-FormData'
const confModelKey: StorageItemKey = 'local:conf-model'

async function activeFormDataKey(): Promise<StorageItemKey> {
  const preset = await storage.getItem<string>(formDataPresetKey, { fallback: 'default' })
  return preset && preset !== 'default'
    ? (`local:web-geek-job-FormData-${preset}` as StorageItemKey)
    : defaultFormDataKey
}

export async function loadAiReplyConfig() {
  const key = await activeFormDataKey()
  const storedFormData = await storage.getItem<Partial<FormData>>(key, { fallback: {} })
  const formData = deepmerge<FormData>(defaultFormData, storedFormData ?? {})
  const models = await storage.getItem<ModelConf[]>(confModelKey, { fallback: [] })

  return {
    formData,
    models: Array.isArray(models) ? models : [],
  }
}
