import assert from 'node:assert/strict'

import { isReactive, reactive } from 'vue'

import { defaultFormData } from '../src/composables/conf/info.ts'
import { createConfSavePayload } from '../src/composables/conf/savePayload.ts'

const formData = reactive({
  ...defaultFormData,
  aiGreeting: {
    ...defaultFormData.aiGreeting,
    model: 'gpt',
  },
})
const presets = reactive([{ label: '默认配置', value: 'default' }])

const payload = createConfSavePayload(formData, 'default', presets)

assert.equal(payload.formData.aiGreeting.model, 'gpt')
assert.equal(payload.formDataPreset, 'default')
assert.deepEqual(payload.formDataPresets, [{ label: '默认配置', value: 'default' }])
assert.equal(isReactive(payload.formData), false)
assert.equal(isReactive(payload.formDataPresets), false)
assert.notEqual(payload.formData, formData)
assert.notEqual(payload.formDataPresets, presets)

console.log('conf save payload verification passed')
