import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  assertGroundedScreening,
  emptyWorkspace,
  validateProfile,
  reserveRequest,
  reserveWorkspaceRequest,
  evidenceInstruction,
  prepareJob,
  validateMessageDraft,
} from '../src/features/ai/workspace.ts'
const profile = validateProfile(['  Vue 项目经验  '], ['前端'], 1)
assert.deepEqual(profile.facts, ['Vue 项目经验'])
assert.equal(prepareJob('Vue 工程师', profile).profileVersion, 1)
assert.match(evidenceInstruction(profile), /Vue 项目经验/)
assert.throws(() => prepareJob(''))
assert.throws(() => validateMessageDraft(' '))
assert.equal(validateMessageDraft(' hello '), 'hello')
const state = emptyWorkspace()
state.dailyRequestLimit = 1
reserveRequest(state, new Date('2026-01-01'))
assert.throws(() => reserveRequest(state, new Date('2026-01-01')))
reserveRequest(state, new Date('2026-01-02'))
let stored = emptyWorkspace()
stored.dailyRequestLimit = 1
const results = await Promise.allSettled(
  Array.from({ length: 4 }, () =>
    reserveWorkspaceRequest(
      'one',
      async () => structuredClone(stored),
      async (v) => {
        stored = structuredClone(v)
      },
    ),
  ),
)
assert.equal(results.filter((v) => v.status === 'fulfilled').length, 1)
assert.equal(stored.usage.requests, 1)
const runtime = readFileSync('src/composables/useModel/test.ts', 'utf8')
assert.match(runtime, /fork\(\)\s*\{\s*return new ChatModel\(this.ctx, true\)/)
assert.match(runtime, /this.ctx.uid !== account/)
const preview = readFileSync('src/components/AI/LLMPromptEdit.vue', 'utf8')
assert.match(preview, /const testModel = helper.chatModel.fork\(\)/)
assert.doesNotMatch(preview, /helper.chatModel.createAgent/)
console.log('AI workspace and isolated preview regressions passed')

assert.doesNotThrow(() =>
  assertGroundedScreening(
    JSON.stringify({ positive: [{ reason: '匹配“Vue开发”' }], negative: [] }),
    '需要Vue开发',
  ),
)
assert.throws(() =>
  assertGroundedScreening(
    JSON.stringify({ positive: [{ reason: '匹配“React开发”' }], negative: [] }),
    '需要Vue开发',
  ),
)
assert.throws(() =>
  assertGroundedScreening(
    JSON.stringify({ positive: [{ reason: '凭空判定' }], negative: [] }),
    '需要Vue开发',
  ),
)

assert.throws(() => assertGroundedScreening('prefix { broken', 'Vue'))
assert.match(runtime, /assertGroundedScreening\(JSON.stringify\(parsed.res\)/)
const { parseFiltering } = await import('../src/composables/useApplying/utils.ts')
const wrapped = parseFiltering(
  'result: {"positive":[{"reason":"fabricated","score":2}],"negative":[]}',
)
assert.ok(wrapped.res)
assert.throws(() => assertGroundedScreening(JSON.stringify(wrapped.res), '需要Vue开发'))
const repaired = parseFiltering('{"positive":[{"reason":"fabricated","score":2}],"negative":[')
assert.equal(repaired.res, null)
const workspaceUi = readFileSync('src/features/ai/Workspace.vue', 'utf8')
assert.match(workspaceUi, /flush: 'sync'/)
assert.ok((workspaceUi.match(/epoch !== accountEpoch/g) ?? []).length >= 5)

assert.match(runtime, /counter.reserveAiRequest\(account\)/)
assert.match(
  readFileSync('src/entrypoints/boss/main.ts', 'utf8'),
  /validateMessageDraft\(target.text\)/,
)
assert.throws(() => validateMessageDraft('x'.repeat(5001)))
assert.throws(() => validateMessageDraft('a' + String.fromCharCode(0)))
