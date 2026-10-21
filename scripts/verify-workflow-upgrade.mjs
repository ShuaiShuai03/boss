import assert from 'node:assert/strict'

import { WorkflowRunCoordinator } from '../src/composables/useApplying/runCoordinator.ts'
import { createWorkflowRunCheckpoint } from '../src/composables/useApplying/runState.ts'
import { parseFiltering } from '../src/composables/useApplying/utils.ts'

const claim = { runId: 'run', ownerId: 'owner', accountId: 'account', batchLimit: 5 }
let stored = createWorkflowRunCheckpoint(claim, 1)
const coordinator = new WorkflowRunCoordinator(
  {
    readWorkflowRun: async () => structuredClone(stored),
    claimWorkflowRun: async () => ({ claimed: true, checkpoint: structuredClone(stored) }),
    updateWorkflowRun: async (_run, _owner, next) => {
      await new Promise((resolve) => setTimeout(resolve, 2))
      stored = structuredClone(next)
      return { updated: true, checkpoint: structuredClone(stored) }
    },
    pauseWorkflowRun: async () => stored,
    resetWorkflowRunFilters: async () => stored,
  },
  claim,
  () => 10,
)
await coordinator.acquire()
await Promise.all([coordinator.beginSubmission('job'), coordinator.heartbeat()])
assert.deepEqual(stored.submissionIntentJobKeys, ['job'])
const confirmations = await Promise.all([
  coordinator.confirmSubmission('job'),
  coordinator.heartbeat(),
  coordinator.confirmSubmission('job'),
])
assert.equal(confirmations[0], true)
assert.equal(confirmations[2], false)
assert.equal(stored.batchSubmitted, 1)
assert.deepEqual(stored.submittedJobKeys, ['job'])
await Promise.all([coordinator.countJob('a'), coordinator.countJob('b')])
assert.deepEqual(stored.countedJobKeys, ['a', 'b'])
console.log('workflow upgrade concurrency regressions passed')

const oversized = parseFiltering('['.repeat(300_000))
assert.equal(oversized.res, null)
const valid = JSON.stringify({ negative: [], positive: [] })
assert.equal(parseFiltering(valid).category, 'ok')
assert.equal(
  parseFiltering(
    Array.from({ length: 65 }, (_, i) =>
      JSON.stringify({ negative: [], positive: [{ reason: String(i), score: 1 }] }),
    ).join(' '),
  ).category,
  'ambiguous',
)
