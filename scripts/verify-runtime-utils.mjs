import assert from 'node:assert/strict'

import {
  EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextInvalidated,
  normalizeExtensionContextError,
} from '../src/utils/extension.ts'
import { TimeoutError, withTimeout } from '../src/utils/promise.ts'

const browserError = new Error(
  "Failed to read the 'onMessage' property from 'Object': Extension context invalidated.",
)

assert.equal(isExtensionContextInvalidated(browserError), true)
assert.equal(
  isExtensionContextInvalidated(
    new Error('Could not establish connection. Receiving end does not exist.'),
  ),
  true,
)
assert.equal(
  isExtensionContextInvalidated(
    new Error('The message port closed before a response was received.'),
  ),
  true,
)
assert.equal(isExtensionContextInvalidated(new Error('AI 请求超时')), false)
assert.equal(
  normalizeExtensionContextError(browserError).message,
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
)
assert.equal(
  EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
  '扩展桥接未连接，请刷新当前 BOSS 页面后再试',
)

await assert.rejects(
  withTimeout(
    new Promise(() => {}),
    1,
    EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
  ),
  (error) =>
    error instanceof TimeoutError &&
    error.message === EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE,
)

const otherError = new Error('other')
assert.equal(normalizeExtensionContextError(otherError), otherError)

console.log('runtime utils verification passed')
