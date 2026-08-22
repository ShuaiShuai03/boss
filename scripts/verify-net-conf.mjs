import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { isNetConf } from '../src/composables/useHelper/netConfValidation.ts'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const source = read('src/composables/useHelper/netConf.ts')

// BH-NET-02: the click handler previously read `item.data.url ?? window.open(item.data.url)`,
// which is a no-op when the URL exists and calls window.open(undefined) when it doesn't -
// backwards in both branches. It must be a real conditional that only opens when a URL is present.
assert.doesNotMatch(source, /item\.data\.url\s*\?\?\s*window\.open\(item\.data\.url\)/)
assert.match(source, /if\s*\(item\.data\.url\)\s*window\.open\(item\.data\.url\)/)

// The configuration is packaged with the extension; a page must not receive mutable remote UI
// instructions or a periodic CDN request.
assert.match(source, /bundledNetConf/)
assert.doesNotMatch(source, /testingcf\.jsdelivr\.net/)
const validConfig = {
  version: '0.5.0',
  notification: [{ key: 'notice', type: 'notification', data: { title: 'ok' } }],
  feedback: 'https://example.com/feedback',
}
assert.equal(isNetConf(validConfig), true)
assert.equal(
  isNetConf({
    ...validConfig,
    notification: [null],
  }),
  false,
)
assert.equal(
  isNetConf({
    ...validConfig,
    notification: [
      {
        key: 'notice',
        type: 'notification',
        data: { title: 'unsafe', url: 'javascript:alert(1)' },
      },
    ],
  }),
  false,
)
assert.match(read('src/composables/useHelper/netConfValidation.ts'), /isSafeHttpsUrl/)
assert.match(source, /netNotification\(item, now\)\.catch/)
console.log('net conf verification passed')
