import assert from 'node:assert/strict'

import {
  accountSessionKey,
  sanitizeStoredReplyConversations,
} from '../src/features/aiReply/draftStorage.ts'
import { messageBelongsToAccount } from '../src/features/aiReply/eventValidation.ts'
import { normalizeAiReplyProtocolMessages } from '../src/features/aiReply/realtimeCore.ts'

const message = { from: { uid: 'hr' }, to: { uid: 'other' }, body: { text: 'private' } }
assert.deepEqual(
  normalizeAiReplyProtocolMessages({ messages: [message] }, { currentUserId: 'me' }),
  [],
)
assert.equal(
  normalizeAiReplyProtocolMessages(
    { messages: [{ ...message, to: { uid: 'me' } }] },
    { currentUserId: 'me' },
  ).length,
  1,
)
assert.notEqual(accountSessionKey('drafts', 'account-a'), accountSessionKey('drafts', 'account-b'))
assert.throws(() => accountSessionKey('drafts', ''))
const conversation = {
  id: 'c',
  jobKey: 'job',
  peer: { uid: 'hr' },
  updatedAt: 100,
  messages: [
    {
      id: 'm',
      conversationId: 'wrong',
      direction: 'incoming',
      text: 'x',
      timestamp: 100,
      sender: { uid: 'hr' },
      recipient: { uid: 'me' },
      peer: { uid: 'hr' },
    },
  ],
}
assert.deepEqual(sanitizeStoredReplyConversations({ c: conversation }, 100), {})
console.log(
  'Security upgrade: recipient filtering, account namespaces, stored message binding passed',
)

assert.equal(
  messageBelongsToAccount(
    {
      direction: 'incoming',
      sender: { uid: 'hr' },
      recipient: { uid: 'other' },
      peer: { uid: 'hr' },
    },
    'me',
  ),
  false,
)
assert.equal(
  messageBelongsToAccount(
    {
      direction: 'incoming',
      sender: { uid: 'hr' },
      recipient: { uid: 'me' },
      peer: { uid: 'spoof' },
    },
    'me',
  ),
  false,
)
assert.equal(
  messageBelongsToAccount(
    { direction: 'incoming', sender: { uid: 'hr' }, recipient: { uid: 'me' }, peer: { uid: 'hr' } },
    'me',
  ),
  true,
)

// Exercise the actual background reservation method with two separate proxy clients.
const { readFileSync } = await import('node:fs')
const { stripTypeScriptTypes } = await import('node:module')
const { emptyWorkspace, reserveRequest } = await import('../src/features/ai/workspace.ts')
const backgroundSource = readFileSync(
  new URL('../src/message/background.ts', import.meta.url),
  'utf8',
)
const method = backgroundSource.slice(
  backgroundSource.indexOf('  async reserveAiRequest('),
  backgroundSource.indexOf('  async readWorkflowRun('),
)
const source = stripTypeScriptTypes(
  `function createCounter() { let aiReservationMutation = Promise.resolve(); return class { ${method} } }`,
)
const records = { 'ai-workspace:a': { ...emptyWorkspace(), dailyRequestLimit: 1 } }
const browser = {
  storage: {
    local: {
      async get(keys) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return Object.fromEntries(keys.map((key) => [key, structuredClone(records[key])]))
      },
      async set(values) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        Object.assign(records, structuredClone(values))
      },
    },
  },
}
const Counter = new Function(
  'browser',
  'emptyWorkspace',
  'reserveRequest',
  'accountSessionKey',
  `${source}; return createCounter()`,
)(browser, emptyWorkspace, reserveRequest, accountSessionKey)
const outcomes = await Promise.allSettled([
  new Counter().reserveAiRequest('a'),
  new Counter().reserveAiRequest('a'),
])
assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1)
assert.equal(records['ai-usage:a'].requests, 1)
// A stale profile save must not restore consumed capacity.
records['ai-workspace:a'] = { ...emptyWorkspace(), dailyRequestLimit: 1 }
await assert.rejects(new Counter().reserveAiRequest('a'), /预算/)
await new Counter().reserveAiRequest('b')
assert.equal(records['ai-usage:b'].requests, 1)
console.log(
  'Background budget: simultaneous clients, stale profile writes and account isolation passed',
)
