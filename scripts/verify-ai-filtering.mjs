import assert from 'node:assert/strict'

import { filteringOutputSchema, parseFiltering } from '../src/composables/useApplying/utils.ts'
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
  assert.equal(result.category, 'ok')
  assert.ok(Number.isFinite(result.rating))
}

// A complete, well-formed response with an explicit successful finish reason is accepted.
const successful = parseFiltering(json, { finishReason: 'stop' })
assert.ok(successful.res)
assert.equal(successful.category, 'ok')

const scored = parseFiltering(json)
assert.equal(scored.rating, 10)
assert.match(scored.message, /外呼销售/)
assert.match(scored.message, /AI 项目经验/)

const categoryCases = [
  ['', 'non_json'],
  ['not json', 'non_json'],
  ['{"negative":"none","positive":[]}', 'missing_field'],
  ['{"negative":[],"positive":[{"reason":"match","score":"10"}]}', 'type_mismatch'],
]
for (const [content, category] of categoryCases) {
  const result = parseFiltering(content)
  assert.equal(result.res, null)
  assert.equal(result.rating, Number.NEGATIVE_INFINITY)
  assert.equal(result.category, category, `expected category ${category} for: ${content}`)
  assert.match(result.message, /^AI 岗位筛选失败/)
}

// Truncated JSON that partial-json can "repair" into a plausible object must never drive an
// auto-decision, regardless of finish reason.
const truncated = '{"negative":[],"positive":[{"reason":"match","score":25}'
const truncatedResult = parseFiltering(truncated, { finishReason: 'length' })
assert.equal(truncatedResult.res, null)
assert.equal(truncatedResult.category, 'truncated')
assert.equal(truncatedResult.rating, Number.NEGATIVE_INFINITY)

// Even a strictly well-formed, complete JSON object must be rejected if the model call itself
// did not finish for an explicit success reason (e.g. cut off right after a lucky closing brace).
const nonStopFinish = parseFiltering(json, { finishReason: 'length' })
assert.equal(nonStopFinish.res, null)
assert.equal(nonStopFinish.category, 'truncated')

// Repaired-but-complete-looking JSON without any finishReason info is still rejected because it
// required the permissive parser (i.e. it was not strictly valid JSON on its own).
const repairedOnly = '{"negative":[],"positive":[{"reason":"match","score":25}]'
const repairedResult = parseFiltering(repairedOnly)
assert.equal(repairedResult.res, null)
assert.equal(repairedResult.category, 'truncated')

// Two distinct, independently schema-valid JSON objects in the same response are ambiguous and
// must not silently pick the first (or last) one.
const ambiguousContent = `${JSON.stringify({
  negative: [{ reason: 'a', score: 1 }],
  positive: [],
})}\n${JSON.stringify({ negative: [], positive: [{ reason: 'b', score: 2 }] })}`
const ambiguousResult = parseFiltering(ambiguousContent)
assert.equal(ambiguousResult.res, null)
assert.equal(ambiguousResult.category, 'ambiguous')

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

// Structured constraint pushed to the SDK request boundary: when a schema is supplied and the
// model is configured as natively JSON-capable, the agent requests a schema-validated object
// instead of unconstrained JSON syntax, and rejects output that doesn't match the contract.
const schemaOutput = createAgentOutput(true, true, filteringOutputSchema)
assert.equal(schemaOutput.name, 'object')
assert.deepEqual(await schemaOutput.parseCompleteOutput({ text: json }, context), response)
await assert.rejects(schemaOutput.parseCompleteOutput({ text: '{"foo":"bar"}' }, context))
await assert.rejects(schemaOutput.parseCompleteOutput({ text: 'not json at all' }, context))
await assert.rejects(
  schemaOutput.parseCompleteOutput(
    { text: '{"negative":[],"positive":[{"reason":"match","score":"10"}]}' },
    context,
  ),
)

// Without a native-JSON-capable model, the schema is not requested (the provider would likely
// ignore/mis-handle response_format); the same strict text validator above is the enforcement
// path in that case.
assert.equal(createAgentOutput(true, false, filteringOutputSchema).name, 'text')

console.log('ai filtering verification passed')
