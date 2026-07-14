import assert from 'node:assert/strict'

import { parseFiltering } from '../src/composables/useApplying/utils.ts'
import { createAgentOutput } from '../src/composables/useModel/agent-output.ts'

const response = {
  negative: [{ reason: '岗位包含大量外呼销售', score: 15 }],
  positive: [{ reason: '岗位需要已有的 AI 项目经验', score: 25 }],
}
const json = JSON.stringify(response)
const fence = '```'
const validResponses = [
  json,
  `${fence}json\n${json}\n${fence}`,
  `${fence}JSON\n${json}\n${fence}`,
  `Here is the result:\n${json}`,
  `<think>{"analysis":"compare requirements first"}</think>\n${json}`,
  JSON.stringify({
    negative: [],
    positive: [{ reason: '岗位描述包含花括号 {example} 和方括号 [example]', score: 10 }],
  }),
]

for (const content of validResponses) {
  const result = parseFiltering(content)
  assert.ok(result.res)
  assert.ok(Number.isFinite(result.rating))
}

const scored = parseFiltering(json)
assert.equal(scored.rating, 10)
assert.match(scored.message, /外呼销售/)
assert.match(scored.message, /AI 项目经验/)

for (const content of [
  '',
  'not json',
  '{"negative":"none","positive":[]}',
  '{"negative":[],"positive":[{"reason":"match","score":"10"}]}',
]) {
  const result = parseFiltering(content)
  assert.equal(result.res, null)
  assert.equal(result.rating, Number.NEGATIVE_INFINITY)
}

const context = {
  response: { id: 'test', timestamp: new Date(0), modelId: 'test' },
  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  finishReason: 'stop',
}

const compatibleOutput = createAgentOutput(true)
assert.equal(compatibleOutput.name, 'text')
assert.equal(
  await compatibleOutput.parseCompleteOutput({ text: validResponses[1] }, context),
  validResponses[1],
)
assert.equal(createAgentOutput(true, false).name, 'text')
assert.equal(createAgentOutput(false, true).name, 'text')

const nativeJsonOutput = createAgentOutput(true, true)
assert.equal(nativeJsonOutput.name, 'json')
assert.deepEqual(await nativeJsonOutput.parseCompleteOutput({ text: json }, context), response)
await assert.rejects(
  nativeJsonOutput.parseCompleteOutput({ text: validResponses[1] }, context),
  /could not parse the response/,
)

console.log('ai filtering verification passed')
