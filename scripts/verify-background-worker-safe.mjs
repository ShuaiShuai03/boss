import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const backgroundBundle = readFileSync(
  new URL('../.output/chrome-mv3/background.js', import.meta.url),
  'utf8',
)

assert.doesNotMatch(backgroundBundle, /document\.currentScript/)
assert.doesNotMatch(backgroundBundle, /BossHelper content bridge/)
assert.doesNotMatch(backgroundBundle, /__boss-helper-content__/)
assert.doesNotMatch(backgroundBundle, /readInjectedContentBridgeOptions/)
assert.doesNotMatch(backgroundBundle, /InjectContentAdapter/)
assert.doesNotMatch(backgroundBundle, /globalThis\.document/)

assert.match(backgroundBundle, /__boss-helper-background__/)

console.log('background worker safety verification passed')
