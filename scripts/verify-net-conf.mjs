import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const source = read('src/composables/useHelper/netConf.ts')

// BH-NET-02: the click handler previously read `item.data.url ?? window.open(item.data.url)`,
// which is a no-op when the URL exists and calls window.open(undefined) when it doesn't -
// backwards in both branches. It must be a real conditional that only opens when a URL is present.
assert.doesNotMatch(source, /item\.data\.url\s*\?\?\s*window\.open\(item\.data\.url\)/)
assert.match(source, /if\s*\(item\.data\.url\)\s*window\.open\(item\.data\.url\)/)

// The remote config fetch must check the HTTP status and validate the response shape before
// trusting it, instead of assuming any 200-or-not JSON body is a well-formed NetConf.
assert.match(source, /response\.ok/)
assert.match(source, /isNetConf/)

console.log('net conf verification passed')
