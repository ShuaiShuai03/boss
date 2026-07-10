import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const sourcePath = 'src/entrypoints/chat-socket.content.ts'
assert.ok(existsSync(new URL(`../${sourcePath}`, import.meta.url)), `${sourcePath} must exist`)
assert.ok(
  !existsSync(new URL('../src/entrypoints/chat-socket.ts', import.meta.url)),
  'legacy unlisted chat-socket.ts must not exist',
)

const source = read(sourcePath)
assert.match(source, /defineContentScript/)
assert.match(source, /injectScript\(['"]\/chat-socket-main-world\.js['"]\)/)
assert.match(source, /runAt:\s*['"]document_start['"]/)
assert.doesNotMatch(source, /world:\s*['"]MAIN['"]/)

const mainWorldSource = read('src/entrypoints/chat-socket-main-world.ts')
assert.match(mainWorldSource, /defineUnlistedScript/)
assert.match(mainWorldSource, /hookChatSocket\(\)/)

const manifestConfig = read('wxt.config.ts')
assert.match(manifestConfig, /chat-socket-main-world\.js/)

if (process.argv.includes('--built')) {
  for (const [browser, output] of [
    ['Chrome', '.output/chrome-mv3/manifest.json'],
    ['Firefox', '.output/firefox-mv2/manifest.json'],
    ['Edge', '.output/edge-mv3/manifest.json'],
  ]) {
    const manifest = JSON.parse(read(output))
    const scripts = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? [])
    assert.ok(
      scripts.includes('content-scripts/chat-socket.js'),
      `${browser} manifest must register content-scripts/chat-socket.js`,
    )
    const resources = (manifest.web_accessible_resources ?? []).flatMap((entry) =>
      typeof entry === 'string' ? [entry] : (entry.resources ?? []),
    )
    assert.ok(
      resources.includes('chat-socket-main-world.js'),
      `${browser} manifest must expose chat-socket-main-world.js`,
    )
  }
}

console.log('chat socket entrypoint verification passed')
