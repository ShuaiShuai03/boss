import assert from 'node:assert/strict'

import {
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextInvalidated,
  normalizeExtensionContextError,
} from '../src/utils/extension.ts'

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

const otherError = new Error('other')
assert.equal(normalizeExtensionContextError(otherError), otherError)

console.log('runtime utils verification passed')
