import assert from 'node:assert/strict'

import {
  PendingMessageQueue,
  pickConversationForMessage,
} from '../src/features/aiReply/conversationRouter.ts'

// Exact conversationId match always wins, even if a peer-based match also exists.
{
  const conversations = new Map([
    ['conv-a', { id: 'conv-a', peer: { uid: '200' } }],
    ['conv-b', { id: 'conv-b', peer: { uid: '200' } }],
  ])
  const picked = pickConversationForMessage(conversations, {
    conversationId: 'conv-b',
    peerUid: '200',
  })
  assert.equal(picked?.id, 'conv-b')
}

// A single conversation for the peer is a safe, unambiguous fallback when the message carries no
// conversation-qualifying ID of its own.
{
  const conversations = new Map([['conv-a', { id: 'conv-a', peer: { uid: '200' } }]])
  const picked = pickConversationForMessage(conversations, {
    conversationId: 'unscoped::200',
    peerUid: '200',
  })
  assert.equal(picked?.id, 'conv-a')
}

// Two conversations for the same peer (e.g. same HR, two different jobs, BH-CHAT-01) must never
// be resolved by guessing; an unscoped message should report "no match".
{
  const conversations = new Map([
    ['conv-a', { id: 'conv-a', peer: { uid: '200' } }],
    ['conv-b', { id: 'conv-b', peer: { uid: '200' } }],
  ])
  const picked = pickConversationForMessage(conversations, {
    conversationId: 'unscoped::200',
    peerUid: '200',
  })
  assert.equal(picked, undefined)
}

// No peer UID and no exact match: nothing to go on.
{
  const conversations = new Map([['conv-a', { id: 'conv-a', peer: { uid: '200' } }]])
  const picked = pickConversationForMessage(conversations, { conversationId: 'x', peerUid: '' })
  assert.equal(picked, undefined)
}

// PendingMessageQueue: bounded FIFO with oldest-first eviction, and retry() keeps only the items
// that still fail.
{
  const queue = new PendingMessageQueue(2)
  queue.push('a')
  queue.push('b')
  queue.push('c')
  assert.equal(queue.size, 2)

  const seen = []
  queue.retry((item) => {
    seen.push(item)
    return item === 'c'
  })
  assert.deepEqual(seen, ['b', 'c'])
  assert.equal(queue.size, 1)

  queue.retry(() => true)
  assert.equal(queue.size, 0)
}

console.log('conversation router verification passed')
