import assert from 'node:assert/strict'

import { normalizeAiReplyProtocolMessages } from '../src/features/aiReply/realtimeCore.ts'

const messages = normalizeAiReplyProtocolMessages(
  {
    messages: [
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9001',
        time: '1767225600000',
        body: {
          text: '方便介绍一下项目经验吗？',
          jobDesc: {
            title: '前端开发工程师',
            company: '示例科技',
            salary: '15-25K',
            education: '本科',
            content: '负责业务系统前端开发。',
          },
        },
      },
      {
        from: { uid: '100', name: 'geek-enc-id', source: 0 },
        to: { uid: '200', name: 'boss-enc-id', source: 0 },
        mid: '9002',
        time: '1767225601000',
        body: {
          text: '可以，我主要做过后台系统和 AI 工具。',
        },
      },
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9003',
        time: '1767225602000',
        body: {},
      },
    ],
  },
  { currentUserId: '100' },
)

assert.equal(messages.length, 2)
assert.equal(messages[0].id, '9001')
assert.equal(messages[0].conversationId, 'boss-chat::200::0')
assert.equal(messages[0].direction, 'incoming')
assert.equal(messages[0].text, '方便介绍一下项目经验吗？')
assert.equal(messages[0].peer.uid, '200')
assert.equal(messages[0].job?.jobName, '前端开发工程师')
assert.equal(messages[0].job?.brand.name, '示例科技')
assert.equal(messages[1].direction, 'outgoing')
assert.equal(messages[1].peer.uid, '200')

console.log('ai reply realtime verification passed')
