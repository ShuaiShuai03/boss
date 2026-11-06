import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  assertGroundedScreening,
  emptyWorkspace,
  jobEvidenceText,
  validateProfile,
  reserveRequest,
  aiWorkspaceStorageKeys,
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
// Without a saved workspace the limit is not enforced; usage is still counted.
const unconfigured = emptyWorkspace()
unconfigured.dailyRequestLimit = 1
reserveRequest(unconfigured, new Date(2026, 0, 3, 1), false)
reserveRequest(unconfigured, new Date(2026, 0, 3, 2), false)
assert.equal(unconfigured.usage.requests, 2)
// Usage days follow the local calendar, not UTC.
assert.equal(unconfigured.usage.date, '2026-01-03')
// UI and worker share one key format; surrounding whitespace in the account id is ignored.
assert.deepEqual(aiWorkspaceStorageKeys(' a b '), aiWorkspaceStorageKeys('a b'))
assert.equal(aiWorkspaceStorageKeys('a b').workspace, 'ai-workspace:a%20b')
assert.throws(() => aiWorkspaceStorageKeys(' '))
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
// Unquoted reasons are allowed; only quotes absent from the job evidence are rejected.
assert.doesNotThrow(() =>
  assertGroundedScreening(
    JSON.stringify({ positive: [{ reason: '凭空判定' }], negative: [] }),
    '需要Vue开发',
  ),
)
// Quotes spanning line breaks or containing double quotes match the flattened job text.
const evidence = jobEvidenceText({ jobDescription: '负责前端\n架构设计', boss: { name: 'A' } })
assert.doesNotThrow(() =>
  assertGroundedScreening(
    JSON.stringify({ positive: [{ reason: '符合「负责前端 架构设计」' }], negative: [] }),
    evidence,
  ),
)

assert.throws(() => assertGroundedScreening('prefix { broken', 'Vue'))
assert.match(runtime, /assertGroundedScreening\(JSON.stringify\(parsed.res\)/)
const { parseFiltering } = await import('../src/composables/useApplying/utils.ts')
const wrapped = parseFiltering(
  'result: {"positive":[{"reason":"fabricated","score":2}],"negative":[]}',
)
assert.ok(wrapped.res)
assert.doesNotThrow(() => assertGroundedScreening(JSON.stringify(wrapped.res), '需要Vue开发'))
// A stray unclosed brace in prose must not hide the JSON that follows it.
const strayBrace = parseFiltering(
  '思考{ 结论如下 {"positive":[{"reason":"ok","score":2}],"negative":[]}',
)
assert.ok(strayBrace.res)
assert.equal(strayBrace.res.positive[0].reason, 'ok')
const strayQuote = parseFiltering(
  '他说"好 [ {"positive":[{"reason":"ok","score":2}],"negative":[]}',
)
assert.ok(strayQuote.res)
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
