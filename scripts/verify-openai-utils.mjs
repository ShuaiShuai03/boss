import assert from 'node:assert/strict'

import {
  getModelEndpointCandidates,
  normalizeOpenaiConfig,
  normalizeOpenaiBaseUrl,
  parseOpenaiModelIds,
} from '../src/composables/useModel/openai-utils.ts'

assert.equal(
  normalizeOpenaiBaseUrl('https://api.example.com/v1/chat/completions'),
  'https://api.example.com/v1',
)
assert.equal(
  normalizeOpenaiBaseUrl('https://api.example.com/v1/models?unused=true'),
  'https://api.example.com/v1',
)
assert.equal(
  normalizeOpenaiBaseUrl('https://ark.cn-beijing.volces.com/api/v3'),
  'https://ark.cn-beijing.volces.com/api/v3',
)
assert.equal(normalizeOpenaiBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1')
assert.throws(() => normalizeOpenaiBaseUrl('javascript:alert(1)'), /仅支持 https:\/\//)
assert.throws(() => normalizeOpenaiBaseUrl('http://192.168.1.10/v1'), /http:\/\/ 仅允许本机地址/)
assert.throws(() => normalizeOpenaiBaseUrl('api.example.com/v1'), /Invalid URL/)

assert.deepEqual(
  getModelEndpointCandidates('https://api.example.com').map((item) => item.modelsUrl),
  ['https://api.example.com/models', 'https://api.example.com/v1/models'],
)
assert.deepEqual(
  getModelEndpointCandidates('https://api.example.com/v1/chat/completions').map(
    (item) => item.modelsUrl,
  ),
  ['https://api.example.com/v1/models'],
)

assert.deepEqual(
  parseOpenaiModelIds(JSON.stringify({ data: [{ id: 'gpt-4o' }, { id: 'deepseek-chat' }] })),
  ['gpt-4o', 'deepseek-chat'],
)
assert.deepEqual(parseOpenaiModelIds(JSON.stringify({ models: ['mimo-v2.5'] })), ['mimo-v2.5'])
assert.deepEqual(parseOpenaiModelIds(JSON.stringify({ model_list: [{ name: 'custom-model' }] })), [
  'custom-model',
])
assert.deepEqual(
  parseOpenaiModelIds(JSON.stringify({ result: { items: [{ model: 'nested-model' }] } })),
  ['nested-model'],
)

assert.deepEqual(
  normalizeOpenaiConfig({
    mode: 'openai',
    base_url: 'https://api.example.com/v1/chat/completions',
    advanced: {
      extra_headers: '{"x-test":"1"}',
      extra_body: '{"provider":{"order":["openai"]}}',
      tools: '[{"type":"web_search"}]',
    },
  }),
  {
    mode: 'openai',
    base_url: 'https://api.example.com/v1',
    other: {},
    advanced: {
      extra_headers: { 'x-test': '1' },
      extra_body: { provider: { order: ['openai'] } },
      tools: [{ type: 'web_search' }],
    },
  },
)

assert.throws(
  () =>
    normalizeOpenaiConfig({
      mode: 'openai',
      advanced: {
        extra_headers: '{bad json',
      },
    }),
  /advanced\.extra_headers 不是有效的 JSON/,
)

assert.throws(
  () =>
    normalizeOpenaiConfig({
      mode: 'openai',
      advanced: {
        tools: '{"type":"web_search"}',
      },
    }),
  /advanced\.tools 必须是 JSON 数组/,
)

console.log('openai utils verification passed')
