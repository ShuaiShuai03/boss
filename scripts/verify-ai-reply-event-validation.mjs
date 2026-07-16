import assert from 'node:assert/strict'

import { sanitizeAiReplyChatEventPayload } from '../src/features/aiReply/eventValidation.ts'

function validMessage(overrides = {}) {
  return {
    id: 'm1',
    conversationId: 'boss-chat::200::0',
    direction: 'incoming',
    text: 'hello',
    timestamp: 1700000000000,
    sender: { uid: '200' },
    recipient: { uid: '100' },
    peer: { uid: '200' },
    ...overrides,
  }
}

function validPayload(overrides = {}) {
  return {
    url: 'https://www.zhipin.com/web/geek/chat',
    user: { uid: '100' },
    messages: [validMessage()],
    ...overrides,
  }
}

// A well-formed payload passes through unchanged.
{
  const result = sanitizeAiReplyChatEventPayload(validPayload())
  assert.ok(result)
  assert.equal(result.messages.length, 1)
}

// Non-object / missing fields at the top level are rejected outright.
assert.equal(sanitizeAiReplyChatEventPayload(null), null)
assert.equal(sanitizeAiReplyChatEventPayload('not an object'), null)
assert.equal(sanitizeAiReplyChatEventPayload({}), null)
assert.equal(sanitizeAiReplyChatEventPayload({ ...validPayload(), url: 42 }), null)
assert.equal(sanitizeAiReplyChatEventPayload({ ...validPayload(), user: null }), null)
assert.equal(sanitizeAiReplyChatEventPayload({ ...validPayload(), messages: 'not an array' }), null)

// A batch that is entirely malformed messages yields no usable payload.
assert.equal(
  sanitizeAiReplyChatEventPayload(validPayload({ messages: [{ id: 'only-id' }] })),
  null,
)

// A mixed batch keeps only the well-formed messages instead of rejecting the whole event.
{
  const result = sanitizeAiReplyChatEventPayload(
    validPayload({ messages: [validMessage(), { id: 'bad' }, validMessage({ id: 'm2' })] }),
  )
  assert.ok(result)
  assert.deepEqual(
    result.messages.map((m) => m.id),
    ['m1', 'm2'],
  )
}

// Oversized text/message-count are rejected/truncated rather than trusted wholesale (a page
// script forging this event shouldn't be able to feed unbounded content into the AI pipeline).
{
  const hugeText = 'x'.repeat(10000)
  const result = sanitizeAiReplyChatEventPayload(
    validPayload({ messages: [validMessage({ text: hugeText })] }),
  )
  assert.equal(result, null)
}
{
  const manyMessages = Array.from({ length: 200 }, (_, i) => validMessage({ id: `m${i}` }))
  const result = sanitizeAiReplyChatEventPayload(validPayload({ messages: manyMessages }))
  assert.ok(result)
  assert.ok(result.messages.length <= 50)
}

// An invalid `direction` or non-finite timestamp invalidates that message.
assert.equal(
  sanitizeAiReplyChatEventPayload(validPayload({ messages: [validMessage({ direction: 'sideways' })] })),
  null,
)
assert.equal(
  sanitizeAiReplyChatEventPayload(validPayload({ messages: [validMessage({ timestamp: Number.NaN })] })),
  null,
)

// A job ref without a usable `key` invalidates the message (key is used as a Map key downstream).
assert.equal(
  sanitizeAiReplyChatEventPayload(validPayload({ messages: [validMessage({ job: { title: 'x' } })] })),
  null,
)
// A job ref with a key, or no job at all, is fine.
assert.ok(sanitizeAiReplyChatEventPayload(validPayload({ messages: [validMessage({ job: { key: 'k1' } })] })))

console.log('ai reply event validation verification passed')
