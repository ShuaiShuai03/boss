import assert from 'node:assert/strict'

import {
  MAX_STORED_STRING_LENGTH,
  truncateForStorage,
} from '../src/utils/logTruncate.ts'

// Short strings pass through untouched.
assert.equal(truncateForStorage('hello'), 'hello')

// Long strings are bounded, with a marker noting the original length (BH-PRIV-01: debug logs must
// not silently retain unbounded AI prompt/response/conversation content).
const long = 'a'.repeat(MAX_STORED_STRING_LENGTH + 500)
const truncated = truncateForStorage(long)
assert.ok(typeof truncated === 'string')
assert.ok(truncated.length < long.length)
assert.match(truncated, /截断，共 \d+ 字符/)
assert.ok(truncated.startsWith('a'.repeat(MAX_STORED_STRING_LENGTH)))

// Nested objects/arrays are truncated recursively but bounded in depth so a deeply nested or
// cyclic-looking structure can't blow up traversal.
const nested = truncateForStorage({ a: { b: { c: { d: long } } } })
assert.equal(typeof nested.a.b.c, 'object')
// At depth >= MAX_STORED_DEPTH the value is returned as-is without further truncation, since
// traversal stops there rather than risking unbounded recursion.
assert.equal(nested.a.b.c.d, long)

// Errors are reduced to name/message (avoids leaking arbitrary custom Error subclass fields).
const err = new Error(long)
err.name = 'CustomError'
const truncatedErr = truncateForStorage(err)
assert.deepEqual(Object.keys(truncatedErr).sort(), ['message', 'name'])
assert.equal(truncatedErr.name, 'CustomError')
assert.match(truncatedErr.message, /截断/)

// Arrays are mapped element-wise.
assert.deepEqual(truncateForStorage(['x', 'y']), ['x', 'y'])

// Primitives and null/undefined pass through untouched.
assert.equal(truncateForStorage(42), 42)
assert.equal(truncateForStorage(null), null)
assert.equal(truncateForStorage(undefined), undefined)

console.log('log truncate verification passed')
