import assert from 'node:assert/strict'

import {
  buildPromptOptimizationMessages,
  cleanGeneratedSystemPrompt,
} from '../src/composables/useModel/promptOptimizer-utils.ts'

const filteringMessages = buildPromptOptimizationMessages({
  target: 'aiFiltering',
  currentSystemPrompt: '当前过滤 system prompt',
  userPreference: '排除销售、电销、客服；优先 Agent 和 LLM 应用岗位。',
})

assert.equal(filteringMessages.length, 2)
assert.match(filteringMessages[1].content, /AI 过滤/)
assert.match(filteringMessages[1].content, /JSON-only/)
assert.match(filteringMessages[1].content, /排除销售/)
assert.match(filteringMessages[1].content, /当前过滤 system prompt/)

const replyMessages = buildPromptOptimizationMessages({
  target: 'aiReply',
  currentSystemPrompt: '当前回复 system prompt',
  userPreference: '语气克制专业，默认 1-2 句，不主动给联系方式。',
})

assert.match(replyMessages[1].content, /AI 回复/)
assert.match(replyMessages[1].content, /语气/)
assert.match(replyMessages[1].content, /克制专业/)
assert.match(replyMessages[1].content, /只输出可发送回复/)

assert.equal(
  cleanGeneratedSystemPrompt('```markdown\nsystem: 新的 system prompt\n```'),
  '新的 system prompt',
)
assert.equal(cleanGeneratedSystemPrompt('System：新的 system prompt'), '新的 system prompt')

console.log('prompt optimizer verification passed')
