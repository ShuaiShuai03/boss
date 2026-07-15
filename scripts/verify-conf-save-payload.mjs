import assert from 'node:assert/strict'

import { isReactive, reactive } from 'vue'

import { defaultFormData } from '../src/composables/conf/info.ts'
import {
  commitAfterPersistence,
  createConfSavePayload,
} from '../src/composables/conf/savePayload.ts'

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

formData.aiGreeting.model = 'edited-while-saving'
presets.push({ label: '保存期间新建', value: 'created-while-saving' })
assert.equal(
  payload.formData.aiGreeting.model,
  'gpt',
  'the persisted snapshot must not absorb edits made while a save is in flight',
)
assert.deepEqual(
  payload.formDataPresets,
  [{ label: '默认配置', value: 'default' }],
  'the persisted preset list must remain the snapshot captured at save start',
)

let releasePersistence
const commitEvents = []
const pendingCommit = commitAfterPersistence(
  () =>
    new Promise((resolve) => {
      releasePersistence = resolve
    }),
  () => commitEvents.push('committed'),
)
assert.deepEqual(commitEvents, [], 'pending storage must not be reported as saved')
releasePersistence()
await pendingCommit
assert.deepEqual(commitEvents, ['committed'])

await assert.rejects(
  commitAfterPersistence(
    async () => {
      throw new Error('fixture configuration storage unavailable')
    },
    () => commitEvents.push('must-not-run'),
  ),
  /configuration storage unavailable/,
)
assert.deepEqual(commitEvents, ['committed'], 'failed storage must not be reported as saved')

console.log('conf save payload verification passed')
