import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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

// Same HR (peer uid 200), two different jobs identified by bizId: the conversationId must differ
// so the two job threads are never collapsed into one (BH-CHAT-01).
const twoJobsSameHr = normalizeAiReplyProtocolMessages(
  {
    messages: [
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9101',
        bizId: 'job-a',
        time: '1767225700000',
        body: { text: '岗位A：方便聊聊吗？' },
      },
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9102',
        bizId: 'job-b',
        time: '1767225701000',
        body: { text: '岗位B：还在看机会吗？' },
      },
    ],
  },
  { currentUserId: '100' },
)
assert.equal(twoJobsSameHr.length, 2)
assert.notEqual(twoJobsSameHr[0].conversationId, twoJobsSameHr[1].conversationId)
assert.match(twoJobsSameHr[0].conversationId, /::job-a$/)
assert.match(twoJobsSameHr[1].conversationId, /::job-b$/)

// A message without any bizId/securityId keeps the previous peer-scoped conversation key
// (backward compatible with follow-up chat turns that don't repeat job metadata).
const noJobIdentity = normalizeAiReplyProtocolMessages(
  {
    messages: [
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9103',
        time: '1767225702000',
        body: { text: '没有岗位标识的普通消息' },
      },
    ],
  },
  { currentUserId: '100' },
)
assert.equal(noJobIdentity[0].conversationId, 'boss-chat::200::0')

const messagesWithoutCurrentUser = normalizeAiReplyProtocolMessages(
  {
    messages: [
      {
        from: { uid: '200', name: 'boss-enc-id', source: 0 },
        to: { uid: '100', name: 'geek-enc-id', source: 0 },
        mid: '9004',
        time: '1767225603000',
        body: { text: '这条消息不能在缺少当前用户 ID 时分类。' },
      },
    ],
  },
  { currentUserId: '' },
)
assert.deepEqual(messagesWithoutCurrentUser, [])

const chatBox = readFileSync(new URL('../src/components/ChatBox.vue', import.meta.url), 'utf8')
assert.match(chatBox, /uid:\s*helper\.protocolUserId/)
assert.doesNotMatch(chatBox, /uid:\s*helper\.userInfo\.id/)
// BH-CHAT-01/02: unscoped/ambiguous messages must go through the safe router and a bounded
// pending queue instead of a naive "first conversation for this peer" guess that silently drops
// or misattributes messages.
assert.match(chatBox, /pickConversationForMessage/)
assert.match(chatBox, /PendingMessageQueue/)
assert.doesNotMatch(chatBox, /function findConversationByPeer/)
// BH-SEC-02: the DOM event payload must be validated, not trusted on `messages.length` alone.
assert.match(chatBox, /sanitizeAiReplyChatEventPayload/)

console.log('ai reply realtime verification passed')
