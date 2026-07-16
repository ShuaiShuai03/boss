import assert from 'node:assert/strict'

import { BoundedBuffer, RateLimitedLogGate } from '../src/features/aiReply/socketCapture.ts'

// BoundedBuffer: bounded FIFO with oldest-first eviction, drain empties it and returns insertion
// order.
{
  const buffer = new BoundedBuffer(2)
  buffer.push('a')
  buffer.push('b')
  buffer.push('c')
  assert.equal(buffer.size, 2)
  assert.deepEqual(buffer.drain(), ['b', 'c'])
  assert.equal(buffer.size, 0)
  assert.deepEqual(buffer.drain(), [])
}

// RateLimitedLogGate: allows the first call, suppresses calls within the interval, allows again
// once the interval has elapsed.
{
  const gate = new RateLimitedLogGate(1000)
  assert.equal(gate.shouldLog(0), true)
  assert.equal(gate.shouldLog(500), false)
  assert.equal(gate.shouldLog(999), false)
  assert.equal(gate.shouldLog(1000), true)
  assert.equal(gate.shouldLog(1001), false)
}

console.log('socket capture verification passed')
