import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { jobStatusTokens } from '../src/components/jobStatusTokens.ts'
import { defaultFormData } from '../src/composables/conf/info.ts'
import { migrateFormData } from '../src/composables/conf/migration.ts'
import { preparePresetSwitch, formDataKeyForPreset } from '../src/composables/conf/preset.ts'
import { createInitializationGate } from '../src/composables/initializationGate.ts'
import {
  createStatisticsStore,
  statisticsKey,
  todayKey,
} from '../src/composables/statisticsStore.ts'
import {
  WorkflowRunCoordinator,
  WorkflowRunTransportError,
} from '../src/composables/useApplying/runCoordinator.ts'
import {
  beginWorkflowSubmission,
  claimWorkflowRun,
  completeWorkflowJob,
  confirmWorkflowSubmission,
  createWorkflowRunCheckpoint,
  heartbeatWorkflowRun,
  markWorkflowJobCounted,
  pauseWorkflowRun,
  releaseWorkflowRun,
  resumePausedWorkflowRun,
  normalizeWorkflowRunCheckpoint,
  resetWorkflowRunFilters,
  forcePauseWorkflowRun,
  maxWorkflowHistoryEntries,
  workflowRunIsStale,
} from '../src/composables/useApplying/runState.ts'
import { createWorkflowStopReason } from '../src/composables/useApplying/stopReason.ts'
import {
  mutateAndPersistModelData,
  normalizeStoredModelData,
} from '../src/composables/useModel/persistence.ts'
import {
  aiReplyConversationStorageKey,
  aiReplyDraftTtlMs,
  sanitizeStoredReplyConversations,
  sanitizeStoredReplyDrafts,
  serializeReplyConversations,
  serializeReplyDrafts,
} from '../src/features/aiReply/draftStorage.ts'
import { BackgroundCounter } from '../src/message/background.ts'
import {
  bossPageMessageTypes,
  parseBossPageRequest,
  parseBossPageSnapshot,
} from '../src/message/pageProtocol.ts'

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
  async storageSetItems(items) {
    if (this.failure) throw this.failure
    for (const { key, value } of items) {
      this.values.set(key, structuredClone(value))
      this.writes.push(key)
    }
  }
}
assert.deepEqual(parseBossPageRequest({ type: bossPageMessageTypes.snapshot }), {
  type: bossPageMessageTypes.snapshot,
})
assert.deepEqual(parseBossPageRequest({ type: bossPageMessageTypes.changePage, page: 2 }), {
  type: bossPageMessageTypes.changePage,
  page: 2,
})
assert.deepEqual(
  parseBossPageRequest({ type: bossPageMessageTypes.selectJob, encryptJobId: 'job-1' }),
  { type: bossPageMessageTypes.selectJob, encryptJobId: 'job-1' },
)
assert.equal(
  parseBossPageRequest({
    type: bossPageMessageTypes.selectJob,
    encryptJobId: 'x'.repeat(501),
  }),
  null,
)
assert.equal(
  parseBossPageRequest({ type: 'boss-helper:page-storage-get', key: 'conf-model' }),
  null,
)
assert.equal(
  parseBossPageRequest({ type: 'boss-helper:page-request', url: 'https://example.com' }),
  null,
)
assert.equal(
  parseBossPageRequest({
    type: bossPageMessageTypes.sendChat,
    packet: [0, 1, 256],
    payload: [1],
  }),
  null,
)
assert.equal(
  parseBossPageRequest({
    type: bossPageMessageTypes.sendChat,
    packet: Array(256_001).fill(0),
    payload: [1],
  }),
  null,
)
const sanitizedPageSnapshot = parseBossPageSnapshot({
  path: '/web/geek/jobs',
  user: { uid: 'user-1', showName: '用户', token: 'must-not-cross' },
  jobs: [],
  page: { page: 1, pageSize: 15 },
  hasMore: false,
  token: 'must-not-cross',
})
assert.equal(sanitizedPageSnapshot?.path, '/web/geek/jobs')
assert.equal(sanitizedPageSnapshot?.user.uid, 'user-1')
assert.equal(sanitizedPageSnapshot?.user.showName, '用户')
assert.deepEqual(sanitizedPageSnapshot?.jobs, [])
assert.deepEqual(sanitizedPageSnapshot?.page, { page: 1, pageSize: 15 })
assert.equal(sanitizedPageSnapshot?.hasMore, false)
assert.equal('token' in (sanitizedPageSnapshot?.user ?? {}), false)
assert.doesNotMatch(JSON.stringify(sanitizedPageSnapshot), /must-not-cross/)
let observedAiRequest
const modelServer = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    observedAiRequest = {
      method: request.method,
      authorization: request.headers.get('authorization'),
      body: await request.text(),
    }
    return Response.json(
      { choices: [{ message: { role: 'assistant', content: '合法隔离请求成功' } }] },
      { headers: { 'x-fixture': 'isolated' } },
    )
  },
})
try {
  const isolatedBackgroundCounter = new BackgroundCounter()
  const baseUrl = `http://127.0.0.1:${modelServer.port}/v1`
  const response = await isolatedBackgroundCounter.aiRequest({
    baseUrl,
    url: `${baseUrl}/chat/completions`,
    method: 'POST',
    headers: {
      authorization: 'Bearer fixture-secret',
      'content-type': 'application/json',
    },
    body: '{"messages":[]}',
    timeoutMs: 5_000,
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers['x-fixture'], 'isolated')
  assert.match(response.body, /合法隔离请求成功/)
  assert.deepEqual(observedAiRequest, {
    method: 'POST',
    authorization: 'Bearer fixture-secret',
    body: '{"messages":[]}',
  })
  await assert.rejects(
    () =>
      isolatedBackgroundCounter.aiRequest({
        baseUrl,
        url: `http://127.0.0.1:${modelServer.port}/outside`,
        method: 'GET',
        headers: {},
        timeoutMs: 5_000,
      }),
    /不属于已配置的模型 Base URL/,
  )
  await assert.rejects(
    () =>
      isolatedBackgroundCounter.aiRequest({
        baseUrl,
        url: `${baseUrl}/chat/completions`,
        method: 'DELETE',
        headers: {},
        timeoutMs: 5_000,
      }),
    /请求方法不受支持/,
  )
  await assert.rejects(
    () =>
      isolatedBackgroundCounter.aiRequest({
        baseUrl: 'http://example.com/v1',
        url: 'http://example.com/v1/models',
        method: 'GET',
        headers: {},
        timeoutMs: 5_000,
      }),
    /仅支持 HTTPS 请求/,
  )
} finally {
  await modelServer.stop(true)
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
assert.deepEqual(migratedFormData.aiFiltering.prompt, [{ role: 'user', content: '旧版筛选提示词' }])
assert.deepEqual(migratedFormData.aiGreeting.prompt, [{ role: 'user', content: '旧版招呼提示词' }])
assert.equal(migratedFormData.jobAddress.include, true)
assert.equal(migratedFormData.dailyLimit.value, 12)
assert.equal(migratedFormData.futureTopLevelValue, 'preserved')
assert.equal(migratedFormData.salaryRange.futureValue, 'preserved')
assert.equal(migratedFormData.aiFiltering.futureValue, 'preserved')
assert.deepEqual(migrateFormData(migratedFormData, defaultFormData), migratedFormData)
assert.equal(legacyFormData.salaryRange.value, '10-20', 'migration must not mutate stored input')
const migratedLegacyDelay = migrateFormData(
  { version: '20240401', delay: { deliveryInterval: 7 } },
  defaultFormData,
)
assert.equal(migratedLegacyDelay.actionDelayMs.value, 7000)
assert.throws(
  () =>
    migrateFormData(
      { version: '20240401', salaryRange: { value: 'invalid-range' } },
      defaultFormData,
    ),
  /历史薪资范围不是有效范围/,
)

assert.equal(
  normalizeStoredModelData(null, '模型配置', (model) => model),
  null,
)
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

const runClaim = {
  runId: 'run-a',
  ownerId: 'tab:1:runtime:a',
  accountId: 'account-a',
  batchLimit: 3,
}
let runCheckpoint = createWorkflowRunCheckpoint(runClaim, 1_000)
assert.equal(workflowRunIsStale(runCheckpoint, 151_000), false)
assert.equal(workflowRunIsStale(runCheckpoint, 151_001), true)

const activeLeaseConflict = claimWorkflowRun(
  runCheckpoint,
  { ...runClaim, ownerId: 'tab:2:runtime:b' },
  2_000,
)
assert.equal(activeLeaseConflict.claimed, false, 'a fresh executor lease must not be stolen')

const sameTabReloadRecovery = claimWorkflowRun(
  runCheckpoint,
  { ...runClaim, ownerId: 'tab:1:runtime:b' },
  2_000,
)
assert.equal(
  sameTabReloadRecovery.claimed,
  true,
  'the same tab must reclaim its lease after reload',
)
assert.equal(sameTabReloadRecovery.checkpoint.lastTransition, 'tab_runtime_recovered')

const staleLeaseRecovery = claimWorkflowRun(
  runCheckpoint,
  { ...runClaim, ownerId: 'tab:2:runtime:b' },
  151_001,
)
const oversizedCheckpoint = normalizeWorkflowRunCheckpoint({
  ...runCheckpoint,
  countedJobKeys: Array.from(
    { length: maxWorkflowHistoryEntries + 1 },
    (_, index) => `job-${index}`,
  ),
  submissionIntentJobKeys: Array.from(
    { length: maxWorkflowHistoryEntries + 1 },
    (_, index) => `job-${index}`,
  ),
  submittedJobKeys: Array.from(
    { length: maxWorkflowHistoryEntries + 1 },
    (_, index) => `job-${index}`,
  ),
  results: Object.fromEntries(
    Array.from({ length: maxWorkflowHistoryEntries + 1 }, (_, index) => [
      `job-${index}`,
      { status: 'success', delivered: true, completedAt: index },
    ]),
  ),
})
assert.equal(oversizedCheckpoint.countedJobKeys.length, maxWorkflowHistoryEntries)
assert.equal(oversizedCheckpoint.countedJobKeys[0], 'job-1')
assert.equal(Object.keys(oversizedCheckpoint.results).length, maxWorkflowHistoryEntries)
assert.equal(staleLeaseRecovery.claimed, true)
assert.equal(staleLeaseRecovery.checkpoint.ownerId, 'tab:2:runtime:b')
assert.equal(staleLeaseRecovery.checkpoint.phase, 'recovering')
assert.equal(staleLeaseRecovery.checkpoint.lastTransition, 'stale_run_recovered')

runCheckpoint = createWorkflowRunCheckpoint(runClaim, 1_000)
const counted = markWorkflowJobCounted(runCheckpoint, runClaim.ownerId, 'job-a', 2_000)
assert.ok(counted)
assert.equal(counted.newlyCounted, true)
const countedAgain = markWorkflowJobCounted(counted.checkpoint, runClaim.ownerId, 'job-a', 2_100)
assert.ok(countedAgain)
assert.equal(countedAgain.newlyCounted, false, 'recovery must not double-count scanned jobs')

const submissionIntent = beginWorkflowSubmission(
  countedAgain.checkpoint,
  runClaim.ownerId,
  'job-a',
  2_200,
)
assert.ok(submissionIntent)
assert.deepEqual(submissionIntent.submissionIntentJobKeys, ['job-a'])
const submission = confirmWorkflowSubmission(submissionIntent, runClaim.ownerId, 'job-a', 2_300)
assert.ok(submission)
assert.equal(submission.newlySubmitted, true)
assert.equal(submission.checkpoint.batchSubmitted, 1)
const submissionAgain = confirmWorkflowSubmission(
  submission.checkpoint,
  runClaim.ownerId,
  'job-a',
  2_400,
)
assert.ok(submissionAgain)
assert.equal(submissionAgain.newlySubmitted, false, 'submission confirmation must be idempotent')
assert.equal(submissionAgain.checkpoint.batchSubmitted, 1)

const completed = completeWorkflowJob(
  submissionAgain.checkpoint,
  runClaim.ownerId,
  'job-a',
  { status: 'success', msg: '投递成功' },
  true,
  2_500,
)
assert.ok(completed)
assert.equal(completed.results['job-a'].delivered, true)

const countedFiltered = markWorkflowJobCounted(completed, runClaim.ownerId, 'job-b', 2_600)
assert.ok(countedFiltered)
const completedFiltered = completeWorkflowJob(
  countedFiltered.checkpoint,
  runClaim.ownerId,
  'job-b',
  { status: 'warn', msg: '筛选跳过' },
  false,
  2_700,
)
assert.ok(completedFiltered)
const filtersReset = resetWorkflowRunFilters(completedFiltered, runClaim.accountId, 2_800)
assert.ok(filtersReset)
assert.deepEqual(filtersReset.countedJobKeys, ['job-a'])
assert.deepEqual(Object.keys(filtersReset.results), ['job-a'])
assert.deepEqual(filtersReset.submittedJobKeys, ['job-a'])
assert.equal(filtersReset.batchSubmitted, 1)

const released = releaseWorkflowRun(filtersReset, runClaim.ownerId, 3_000, 'page_lifecycle')
assert.ok(released)
assert.equal(released.ownerId, null)
assert.equal(released.intent, 'running', 'lifecycle loss must preserve automatic recovery intent')
const lifecycleRecovery = claimWorkflowRun(released, { ...runClaim, ownerId: 'runtime-b' }, 3_001)
assert.equal(lifecycleRecovery.claimed, true, 'a released lifecycle lease must recover immediately')
assert.equal(lifecycleRecovery.checkpoint.batchSubmitted, 1)
assert.equal(lifecycleRecovery.checkpoint.results['job-a'].delivered, true)

const paused = pauseWorkflowRun(runCheckpoint, runClaim.ownerId, 4_000)
assert.ok(paused)
assert.equal(paused.intent, 'paused')
assert.equal(
  claimWorkflowRun(paused, { ...runClaim, ownerId: 'runtime-b' }, 999_999).claimed,
  false,
  'manual pause must remain authoritative even after the lease is stale',
)
const manuallyResumed = resumePausedWorkflowRun(
  paused,
  { ...runClaim, ownerId: 'runtime-b' },
  1_000_000,
)
assert.equal(manuallyResumed.intent, 'running')
assert.equal(manuallyResumed.ownerId, 'runtime-b')

assert.equal(
  heartbeatWorkflowRun(runCheckpoint, 'wrong-owner', 5_000),
  null,
  'an orphaned executor must not update a replacement lease',
)

class MemoryWorkflowRunTransport {
  checkpoint = null
  hang = false

  async readWorkflowRun() {
    if (this.hang) return new Promise(() => {})
    return structuredClone(this.checkpoint)
  }

  async claimWorkflowRun(claim, now, resumePaused = false) {
    if (this.hang) return new Promise(() => {})
    const normalized = normalizeWorkflowRunCheckpoint(this.checkpoint)
    const result =
      resumePaused && normalized?.intent === 'paused'
        ? { claimed: true, checkpoint: resumePausedWorkflowRun(this.checkpoint, claim, now) }
        : claimWorkflowRun(this.checkpoint, claim, now)
    if (result.claimed) this.checkpoint = structuredClone(result.checkpoint)
    return structuredClone(result)
  }

  async updateWorkflowRun(runId, ownerId, next) {
    if (this.hang) return new Promise(() => {})
    const current = normalizeWorkflowRunCheckpoint(this.checkpoint)
    if (!current || current.runId !== runId || current.ownerId !== ownerId) {
      return { updated: false, checkpoint: structuredClone(current) }
    }
    this.checkpoint = structuredClone(next)
    return { updated: true, checkpoint: structuredClone(next) }
  }

  async pauseWorkflowRun(accountId, now) {
    if (this.hang) return new Promise(() => {})
    this.checkpoint = forcePauseWorkflowRun(this.checkpoint, accountId, now)
    return structuredClone(this.checkpoint)
  }

  async resetWorkflowRunFilters(accountId, now) {
    if (this.hang) return new Promise(() => {})
    this.checkpoint = resetWorkflowRunFilters(this.checkpoint, accountId, now)
    return structuredClone(this.checkpoint)
  }
}

let coordinatorNow = 10_000
const workflowTransport = new MemoryWorkflowRunTransport()
const coordinatorA = new WorkflowRunCoordinator(
  workflowTransport,
  { ...runClaim, runId: 'coordinator-run' },
  () => coordinatorNow,
  20,
)
assert.equal(await coordinatorA.acquire(), true)
assert.equal(await coordinatorA.countJob('job-a'), true)
assert.deepEqual(await coordinatorA.beginSubmission('job-a'), { needsReconciliation: false })
assert.equal(await coordinatorA.confirmSubmission('job-a'), true)
await coordinatorA.completeJob('job-a', { status: 'success', msg: '投递成功' }, true)

const supersededCheckpoint = structuredClone(coordinatorA.checkpoint)
coordinatorNow += 1
const reloadedCoordinator = new WorkflowRunCoordinator(
  workflowTransport,
  { ...runClaim, runId: 'ignored-reload-run', ownerId: 'tab:1:runtime:reloaded' },
  () => coordinatorNow,
  20,
)
assert.equal(
  await reloadedCoordinator.acquire(),
  true,
  'same-tab reload must replace the page owner',
)
const lateHeartbeat = heartbeatWorkflowRun(
  supersededCheckpoint,
  supersededCheckpoint.ownerId,
  coordinatorNow + 1,
)
assert.ok(lateHeartbeat)
assert.equal(
  (
    await workflowTransport.updateWorkflowRun(
      supersededCheckpoint.runId,
      supersededCheckpoint.ownerId,
      lateHeartbeat,
    )
  ).updated,
  false,
  'a late write from the superseded page must not overwrite recovered progress',
)
await reloadedCoordinator.release('page_lifecycle')

coordinatorNow += 1
const coordinatorB = new WorkflowRunCoordinator(
  workflowTransport,
  { ...runClaim, runId: 'ignored-new-run', ownerId: 'runtime-b' },
  () => coordinatorNow,
  20,
)
assert.equal(await coordinatorB.acquire(), true, 'a replacement runtime must claim a released run')
assert.equal(coordinatorB.hasCompleted('job-a'), true)
assert.equal(coordinatorB.hasSubmitted('job-a'), true)
assert.equal(coordinatorB.checkpoint.batchSubmitted, 1)
assert.deepEqual(
  await coordinatorB.beginSubmission('job-a'),
  { needsReconciliation: false },
  'confirmed submissions must never become recovery intents again',
)
assert.equal(await coordinatorB.confirmSubmission('job-a'), false)
assert.equal(coordinatorB.checkpoint.batchSubmitted, 1)

await coordinatorB.pause()
coordinatorNow += 1_000_000
const coordinatorC = new WorkflowRunCoordinator(
  workflowTransport,
  { ...runClaim, runId: 'coordinator-c', ownerId: 'runtime-c' },
  () => coordinatorNow,
  20,
)
assert.equal(await coordinatorC.acquire(), false, 'automatic recovery must respect manual pause')
assert.equal(
  await coordinatorC.acquire(true),
  true,
  'an explicit user action may resume a paused run',
)

workflowTransport.hang = true
await assert.rejects(coordinatorC.read(), WorkflowRunTransportError)
workflowTransport.hang = false

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
presetStorage.values.set(formDataKeyForPreset('profile-a'), {
  profile: 'profile-a',
  deliveryLimit: 3,
})
presetStorage.values.set(formDataKeyForPreset('profile-b'), {
  profile: 'profile-b',
  deliveryLimit: 9,
})
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
assert.equal(
  forcedReload.todayData.total,
  1,
  'forced reload must flush pending in-memory statistics',
)
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
importStorage.failure = new Error('fixture import write unavailable')
await assert.rejects(
  importedStatistics.setStatistics(
    JSON.stringify({
      t: { date: '2026-07-14', total: 9 },
      s: [],
    }),
  ),
  /fixture import write unavailable/,
)
assert.equal(importedStatistics.todayData.total, 3)
assert.match(importedStatistics.persistenceError.value, /fixture import write unavailable/)
assert.equal(importStorage.writes.length, writesBeforeInvalidImport)
importStorage.failure = null

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
assert.equal(aiReplyConversationStorageKey, 'boss-helper-ai-reply-conversations')
const storedConversation = {
  id: 'conversation-a',
  jobKey: 'boss::job-a',
  peer: { uid: '200', name: 'HR' },
  messages: [
    {
      id: 'message-a',
      conversationId: 'conversation-a',
      direction: 'incoming',
      text: '你好',
      timestamp: draftNow - 1000,
      sender: { uid: '200' },
      recipient: { uid: '100' },
      peer: { uid: '200' },
    },
  ],
  updatedAt: draftNow - 1000,
}
const serializedConversations = serializeReplyConversations(
  new Map([['conversation-a', storedConversation]]),
)
assert.deepEqual(
  sanitizeStoredReplyConversations(serializedConversations, draftNow),
  serializedConversations,
)
assert.deepEqual(
  sanitizeStoredReplyConversations(
    { broken: { ...storedConversation, messages: [{ id: 'broken' }] } },
    draftNow,
  ),
  {},
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
assert.deepEqual(
  modelData.map((model) => model.key),
  ['model-a', 'model-b'],
)
assert.deepEqual(
  persistedModels[0].map((model) => model.key),
  ['model-a', 'model-b'],
)
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
const handlesSource = readFileSync(
  new URL('../src/composables/useApplying/handles.ts', import.meta.url),
  'utf8',
)
const deliverySource = readFileSync(
  new URL('../src/entrypoints/boss/delivery.ts', import.meta.url),
  'utf8',
)
assert.match(handlesSource, /duplicateCompanyId/)
assert.match(handlesSource, /duplicateHrId/)
assert.doesNotMatch(handlesSource, /someSet\.add\(data\.key\)/)
assert.match(deliverySource, /recordSuccessfulDuplicateContact/)
const confSource = readFileSync(
  new URL('../src/composables/conf/index.ts', import.meta.url),
  'utf8',
)
const chatBoxSource = readFileSync(
  new URL('../src/components/ChatBox.vue', import.meta.url),
  'utf8',
)
assert.match(confSource, /counter\.storageSetItems/)
assert.doesNotMatch(chatBoxSource, /maybeAutoGenerateDraft/)
const applyingSource = readFileSync(
  new URL('../src/composables/useApplying/index.ts', import.meta.url),
  'utf8',
)
assert.match(applyingSource, /errors\.set\(task\.id, e\)\s*throw e/)
assert.match(applyingSource, /instanceof LimitError/)
assert.match(applyingSource, /instanceof RateLimitError/)
const protobufSource = readFileSync(
  new URL('../src/composables/useWebSocket/protobuf.ts', import.meta.url),
  'utf8',
)
assert.match(protobufSource, /bossPageGateway\.sendChat\(this\.packet, this\.payload\)/)
assert.doesNotMatch(protobufSource, /ChatWebsocket|window\.socket|sendChatByGeekChatCore/)
const requestSource = readFileSync(
  new URL('../src/entrypoints/boss/requests.ts', import.meta.url),
  'utf8',
)
assert.match(
  requestSource,
  /throw new PublishError\(e instanceof Error \? e\.message : String\(e\)\)/,
)
assert.doesNotMatch(requestSource, /return sendPublishReq\(data, e\?\.message/)
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

// 自定义属性的 var() 是在“声明它的那个元素”上求值的，结果再往下继承。浅色令牌
// 声明在带 data-cr-theme 的外壳上，所以 --ui-* 桥接层必须也声明在同一批选择器
// 上；只写 :host 的话 --ui-bg 会在 :host 上被解析成深色并一路继承，切到浅色后
// Nuxt UI 组件仍然是深色，而自绘的控制室外壳已经变浅——就是主题错配那个 bug。
function selectorOfRuleDeclaring(css, property) {
  const index = css.indexOf(`\n  ${property}`)
  assert.ok(index !== -1, `main.css must declare ${property}`)
  const open = css.lastIndexOf('{', index)
  const previous = css.lastIndexOf('}', open)
  // 注释里正好写着 [data-cr-theme]，不剥掉的话断言会匹配到说明文字而不是选择器
  return css.slice(previous + 1, open).replace(/\/\*[\s\S]*?\*\//g, '')
}

for (const property of ['--ui-bg:', '--ui-text:', '--ui-primary:']) {
  assert.match(
    selectorOfRuleDeclaring(mainStyles, property),
    /\[data-cr-theme\]/,
    `${property} must be declared on the themed root too, or light mode keeps dark Nuxt UI colours`,
  )
}

statistics.dispose()
rollover.dispose()
failing.dispose()
writeFailure.dispose()
forcedReload.dispose()
invalidStatistics.dispose()
importedStatistics.dispose()

console.log('state foundation verification passed')
