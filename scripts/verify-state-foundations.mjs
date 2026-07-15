import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { preparePresetSwitch, formDataKeyForPreset } from '../src/composables/conf/preset.ts'
import { migrateFormData } from '../src/composables/conf/migration.ts'
import { defaultFormData } from '../src/composables/conf/info.ts'
import { createInitializationGate } from '../src/composables/initializationGate.ts'
import {
  createStatisticsStore,
  statisticsKey,
  todayKey,
} from '../src/composables/statisticsStore.ts'
import { jobStatusTokens } from '../src/components/jobStatusTokens.ts'
import { createWorkflowStopReason } from '../src/composables/useApplying/stopReason.ts'
import {
  mutateAndPersistModelData,
  normalizeStoredModelData,
} from '../src/composables/useModel/persistence.ts'
import {
  aiReplyDraftTtlMs,
  sanitizeStoredReplyDrafts,
  serializeReplyDrafts,
} from '../src/features/aiReply/draftStorage.ts'

class MemoryStorage {
  values = new Map()
  writes = []
  failure = null

  async storageGet(key, fallback) {
    if (this.failure) throw this.failure
    return structuredClone(this.values.has(key) ? this.values.get(key) : fallback)
  }

  async storageSet(key, value) {
    if (this.failure) throw this.failure
    this.values.set(key, structuredClone(value))
    this.writes.push(key)
  }
}

assert.equal(formDataKeyForPreset('default'), 'local:web-geek-job-FormData')
assert.equal(formDataKeyForPreset('profile-b'), 'local:web-geek-job-FormData-profile-b')

const legacyFormData = {
  version: '20240401',
  salaryRange: { value: '10-20', futureValue: 'preserved' },
  companySizeRange: { value: '50-500' },
  aiFiltering: { prompt: '旧版筛选提示词', futureValue: 'preserved' },
  aiGreeting: { prompt: '旧版招呼提示词' },
  jobAddress: { value: ['北京'], include: false },
  deliveryLimit: { value: 12 },
  futureTopLevelValue: 'preserved',
}
const migratedFormData = migrateFormData(legacyFormData, defaultFormData)
assert.equal(migratedFormData.version, '20260521')
assert.deepEqual(migratedFormData.salaryRange.value, [10, 20, false])
assert.deepEqual(migratedFormData.companySizeRange.value, [50, 500, false])
assert.deepEqual(migratedFormData.aiFiltering.prompt, [
  { role: 'user', content: '旧版筛选提示词' },
])
assert.deepEqual(migratedFormData.aiGreeting.prompt, [
  { role: 'user', content: '旧版招呼提示词' },
])
assert.equal(migratedFormData.jobAddress.include, true)
assert.equal(migratedFormData.dailyLimit.value, 12)
assert.equal(migratedFormData.futureTopLevelValue, 'preserved')
assert.equal(migratedFormData.salaryRange.futureValue, 'preserved')
assert.equal(migratedFormData.aiFiltering.futureValue, 'preserved')
assert.deepEqual(migrateFormData(migratedFormData, defaultFormData), migratedFormData)
assert.equal(legacyFormData.salaryRange.value, '10-20', 'migration must not mutate stored input')
assert.throws(
  () =>
    migrateFormData(
      { version: '20240401', salaryRange: { value: 'invalid-range' } },
      defaultFormData,
    ),
  /历史薪资范围不是有效范围/,
)

assert.equal(normalizeStoredModelData(null, '模型配置', (model) => model), null)
assert.deepEqual(
  normalizeStoredModelData([{ key: 'model-a' }], '模型配置', (model) => model),
  [{ key: 'model-a' }],
)
assert.throws(
  () => normalizeStoredModelData({ key: 'model-a' }, '模型配置', (model) => model),
  /模型配置不是有效数组/,
)

const expectedStopReasons = {
  manual: ['已手动暂停', 'info'],
  batch_limit: ['本批已完成', 'info'],
  consecutive_failures: ['连续失败，已自动暂停', 'error'],
  no_jobs: ['当前页面没有可处理岗位', 'warning'],
  no_more_jobs: ['没有更多岗位', 'info'],
  context_invalidated: ['扩展已更新，需要刷新页面', 'error'],
  unexpected_error: ['工作流发生错误', 'error'],
}
for (const [code, [title, severity]] of Object.entries(expectedStopReasons)) {
  assert.deepEqual(createWorkflowStopReason(code, `fixture:${code}`), {
    code,
    title,
    message: `fixture:${code}`,
    severity,
  })
}

const presetEvents = []
const switched = await preparePresetSwitch({
  value: 'profile-b',
  async load(value) {
    presetEvents.push(`load:${value}`)
    return { profile: value, deliveryLimit: 20 }
  },
  async persistSelection(value) {
    presetEvents.push(`persist:${value}`)
  },
})
assert.deepEqual(switched, { profile: 'profile-b', deliveryLimit: 20 })
assert.deepEqual(presetEvents, ['load:profile-b', 'persist:profile-b'])

let persistedFailedPreset = false
await assert.rejects(
  preparePresetSwitch({
    value: 'broken',
    async load() {
      throw new Error('fixture load failure')
    },
    async persistSelection() {
      persistedFailedPreset = true
    },
  }),
  /fixture load failure/,
)
assert.equal(persistedFailedPreset, false)

const presetStorage = new MemoryStorage()
presetStorage.values.set(formDataKeyForPreset('profile-a'), { profile: 'profile-a', deliveryLimit: 3 })
presetStorage.values.set(formDataKeyForPreset('profile-b'), { profile: 'profile-b', deliveryLimit: 9 })
const profileB = await preparePresetSwitch({
  value: 'profile-b',
  load: (value) => presetStorage.storageGet(formDataKeyForPreset(value), {}),
  persistSelection: (value) => presetStorage.storageSet('local:selected-preset', value),
})
profileB.deliveryLimit = 10
await presetStorage.storageSet(formDataKeyForPreset('profile-b'), profileB)
assert.deepEqual(presetStorage.values.get(formDataKeyForPreset('profile-a')), {
  profile: 'profile-a',
  deliveryLimit: 3,
})
assert.equal(presetStorage.values.get(formDataKeyForPreset('profile-b')).deliveryLimit, 10)

const storage = new MemoryStorage()
storage.values.set(todayKey, {
  date: '2026-07-14',
  success: 4,
  total: 7,
  repeat: 1,
  activityFilter: 2,
  tasks: { existing: { success: 4 } },
})
storage.values.set(statisticsKey, [
  {
    date: '2026-07-13',
    success: 3,
    total: 6,
    repeat: 0,
    activityFilter: 1,
    tasks: {},
  },
])

const statistics = createStatisticsStore(storage, '2026-07-14')
assert.equal(storage.writes.length, 0, 'default state must not overwrite storage before hydration')
await statistics.initialize()
assert.equal(statistics.initializationStatus.value, 'ready')
assert.equal(statistics.todayData.success, 4)
assert.equal(statistics.statisticsData.value[0].date, '2026-07-13')

statistics.todayData.success += 1
statistics.todayData.total += 1
await statistics.flush()
assert.equal(storage.values.get(todayKey).success, 5)
assert.equal(storage.values.get(todayKey).total, 8)

const rolloverStorage = new MemoryStorage()
rolloverStorage.values.set(todayKey, {
  date: '2026-07-13',
  success: 2,
  total: 4,
  repeat: 0,
  activityFilter: 0,
  tasks: {},
})
rolloverStorage.values.set(statisticsKey, [])
const rollover = createStatisticsStore(rolloverStorage, '2026-07-14')
await rollover.initialize()
assert.equal(rollover.todayData.date, '2026-07-14')
assert.equal(rollover.todayData.success, 0)
assert.equal(rollover.statisticsData.value[0].date, '2026-07-13')

const failingStorage = new MemoryStorage()
failingStorage.failure = new Error('fixture storage unavailable')
const failing = createStatisticsStore(failingStorage, '2026-07-14')
await assert.rejects(failing.initialize(), /fixture storage unavailable/)
assert.equal(failing.initializationStatus.value, 'error')
assert.match(failing.initializationError.value, /storage unavailable/)
assert.equal(failingStorage.writes.length, 0)

failingStorage.failure = null
await failing.initialize(true)
assert.equal(failing.initializationStatus.value, 'ready')

const writeFailureStorage = new MemoryStorage()
const writeFailure = createStatisticsStore(writeFailureStorage, '2026-07-14')
await writeFailure.initialize()
writeFailureStorage.failure = new Error('fixture write unavailable')
writeFailure.todayData.total += 1
await assert.rejects(writeFailure.flush(), /write unavailable/)
assert.match(writeFailure.persistenceError.value, /write unavailable/)
writeFailureStorage.failure = null
writeFailure.todayData.total += 1
await writeFailure.flush()
assert.equal(writeFailure.persistenceError.value, null)
assert.equal(writeFailureStorage.values.get(todayKey).total, 2)

const forcedReloadStorage = new MemoryStorage()
const forcedReload = createStatisticsStore(forcedReloadStorage, '2026-07-14')
await forcedReload.initialize()
forcedReload.todayData.total += 1
await forcedReload.initialize(true)
assert.equal(forcedReload.todayData.total, 1, 'forced reload must flush pending in-memory statistics')
assert.equal(forcedReloadStorage.values.get(todayKey).total, 1)

const invalidStatisticsStorage = new MemoryStorage()
invalidStatisticsStorage.values.set(todayKey, {
  date: '2026-07-14',
  success: 1,
  total: 'not-a-number',
  repeat: 0,
  activityFilter: 0,
  tasks: {},
})
invalidStatisticsStorage.values.set(statisticsKey, [])
const invalidStatistics = createStatisticsStore(invalidStatisticsStorage, '2026-07-14')
await assert.rejects(invalidStatistics.initialize(), /today statistics|今日统计|非负数/)
assert.equal(invalidStatistics.initializationStatus.value, 'error')
assert.equal(invalidStatisticsStorage.writes.length, 0, 'invalid persisted data must fail closed')

const importStorage = new MemoryStorage()
const importedStatistics = createStatisticsStore(importStorage, '2026-07-14')
await importedStatistics.initialize()
importedStatistics.todayData.total = 3
await importedStatistics.flush()
const writesBeforeInvalidImport = importStorage.writes.length
await assert.rejects(
  importedStatistics.setStatistics(
    JSON.stringify({
      t: { date: '2026-07-14', total: -1 },
      s: [],
    }),
  ),
  /非负数/,
)
assert.equal(importedStatistics.todayData.total, 3)
assert.equal(importStorage.writes.length, writesBeforeInvalidImport)

let releaseInitialization
let delayedInitializationCalls = 0
const delayedInitialization = createInitializationGate(
  () =>
    new Promise((resolve) => {
      delayedInitializationCalls += 1
      releaseInitialization = resolve
    }),
)
const delayedFirst = delayedInitialization.ensureInitialized()
const delayedSecond = delayedInitialization.ensureInitialized()
assert.equal(delayedInitialization.initializationStatus.value, 'loading')
assert.equal(delayedInitializationCalls, 1)
releaseInitialization()
await Promise.all([delayedFirst, delayedSecond])
assert.equal(delayedInitialization.initializationStatus.value, 'ready')

let initializationShouldFail = true
let protectedWorkflowRuns = 0
const rejectedInitialization = createInitializationGate(async () => {
  if (initializationShouldFail) throw new Error('fixture configuration unavailable')
})
async function guardedWorkflowStart() {
  try {
    await rejectedInitialization.ensureInitialized()
  } catch {
    return
  }
  protectedWorkflowRuns += 1
}
await guardedWorkflowStart()
assert.equal(rejectedInitialization.initializationStatus.value, 'error')
assert.match(rejectedInitialization.initializationError.value, /configuration unavailable/)
assert.equal(protectedWorkflowRuns, 0)
initializationShouldFail = false
await rejectedInitialization.ensureInitialized(true)
await guardedWorkflowStart()
assert.equal(protectedWorkflowRuns, 1)

const draftNow = Date.UTC(2026, 6, 14)
const restoredDrafts = sanitizeStoredReplyDrafts(
  {
    first: { text: '第一条草稿', dirty: true, updatedAt: draftNow - 1000 },
    second: { text: '第二条草稿', dirty: false, updatedAt: draftNow - 2000 },
    expired: { text: '过期草稿', dirty: true, updatedAt: draftNow - aiReplyDraftTtlMs - 1 },
    future: { text: '未来草稿', dirty: true, updatedAt: draftNow + 1 },
    empty: { text: '  ', dirty: true, updatedAt: draftNow },
  },
  draftNow,
)
assert.deepEqual(Object.keys(restoredDrafts).sort(), ['first', 'second'])
assert.equal(restoredDrafts.first.dirty, true)
assert.equal(restoredDrafts.second.text, '第二条草稿')

const replyDrafts = new Map([
  ['first', { text: '第一条草稿', dirty: true, updatedAt: draftNow - 1000 }],
  ['second', { text: '第二条草稿', dirty: true, updatedAt: draftNow - 500 }],
])
assert.deepEqual(Object.keys(serializeReplyDrafts(replyDrafts)).sort(), ['first', 'second'])
replyDrafts.get('first').text = ''
assert.deepEqual(
  Object.keys(serializeReplyDrafts(replyDrafts)),
  ['second'],
  'clearing one sent draft must retain every other conversation draft',
)

let modelData = [{ key: 'model-a', name: '模型 A' }]
const persistedModels = []
const modelSuccessEvents = []
let releaseModelPersistence
const pendingModelPersistence = mutateAndPersistModelData({
  models: modelData,
  mutation: (models) => models.push({ key: 'model-b', name: '模型 B' }),
  prepare: (models) => structuredClone(models),
  persist: async (models) => {
    await new Promise((resolve) => {
      releaseModelPersistence = resolve
    })
    persistedModels.push(structuredClone(models))
  },
  replace: (models) => {
    modelData = models
  },
  onSuccess: () => modelSuccessEvents.push('saved'),
})
assert.deepEqual(
  modelData.map((model) => model.key),
  ['model-a'],
  'pending model persistence must not expose uncommitted mutations',
)
assert.deepEqual(modelSuccessEvents, [])
releaseModelPersistence()
await pendingModelPersistence
assert.deepEqual(modelData.map((model) => model.key), ['model-a', 'model-b'])
assert.deepEqual(persistedModels[0].map((model) => model.key), ['model-a', 'model-b'])
assert.deepEqual(modelSuccessEvents, ['saved'])

await assert.rejects(
  mutateAndPersistModelData({
    models: modelData,
    mutation: (models) => models.splice(0, 1),
    prepare: (models) => structuredClone(models),
    persist: async () => {
      throw new Error('fixture model storage unavailable')
    },
    replace: (models) => {
      modelData = models
    },
    onSuccess: () => modelSuccessEvents.push('must-not-run'),
  }),
  /model storage unavailable/,
)
assert.deepEqual(
  modelData.map((model) => model.key),
  ['model-a', 'model-b'],
  'failed model persistence must roll back the in-memory mutation',
)
assert.deepEqual(modelSuccessEvents, ['saved'], 'failed persistence must not emit success')

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

for (const [status, token] of Object.entries(jobStatusTokens)) {
  assert.ok(
    contrastRatio(token.foreground, token.background) >= 4.5,
    `${status} status text must meet WCAG AA contrast`,
  )
}

const statisticsComponent = readFileSync(
  new URL('../src/components/Tabs/Statistics.vue', import.meta.url),
  'utf8',
)
const appearanceComponent = readFileSync(
  new URL('../src/components/Tabs/Appearance.vue', import.meta.url),
  'utf8',
)
const appComponent = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
const configComponent = readFileSync(
  new URL('../src/components/Tabs/Config.vue', import.meta.url),
  'utf8',
)
const mainStyles = readFileSync(new URL('../src/assets/main.css', import.meta.url), 'utf8')
assert.doesNotMatch(statisticsComponent, /useStatistics\(/)
assert.doesNotMatch(appearanceComponent, /useStatistics\(/)
assert.match(statisticsComponent, /const statistics = ctx\.statistics/)
assert.match(appComponent, /text-highlighted/)
assert.doesNotMatch(appComponent, /text-highlighte(?!d)/)
assert.match(configComponent, /将当前配置保存到所选预设。/)
assert.doesNotMatch(configComponent, /保存配置，会自动刷新页面/)
assert.match(mainStyles, /scrollbar-gutter:\s*stable/)
assert.doesNotMatch(mainStyles, /scrollbar-gutter:\s*always/)

statistics.dispose()
rollover.dispose()
failing.dispose()
writeFailure.dispose()
forcedReload.dispose()
invalidStatistics.dispose()
importedStatistics.dispose()

console.log('state foundation verification passed')
