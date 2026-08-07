import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../.output/chrome-mv3/', import.meta.url))
assert.ok(existsSync(outputDirectory), 'Chrome build output is missing; run build:chrome first')

function relativeFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(prefix, entry.name)
    const absolutePath = path.join(directory, entry.name)
    return entry.isDirectory() ? relativeFiles(absolutePath, relativePath) : [relativePath]
  })
}

function wildcardPattern(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`)
}

const files = relativeFiles(outputDirectory)
const manifest = JSON.parse(readFileSync(path.join(outputDirectory, 'manifest.json'), 'utf8'))
assert.equal(manifest.manifest_version, 3)
assert.equal(manifest.background?.service_worker, 'background.js')
assert.equal(manifest.options_ui?.page, 'options.html')

const manifestReferences = [
  manifest.background?.service_worker,
  manifest.options_ui?.page,
  ...(manifest.content_scripts ?? []).flatMap((entry) => [
    ...(entry.js ?? []),
    ...(entry.css ?? []),
  ]),
].filter(Boolean)
for (const reference of manifestReferences) {
  assert.ok(files.includes(reference), `Manifest references missing file: ${reference}`)
}

const accessiblePatterns = (manifest.web_accessible_resources ?? []).flatMap(
  (entry) => entry.resources ?? [],
)
for (const pattern of accessiblePatterns) {
  assert.ok(
    files.some((file) => wildcardPattern(pattern).test(file)),
    `No artifact matches ${pattern}`,
  )
}
assert.ok(accessiblePatterns.includes('boss.js'))
assert.ok(accessiblePatterns.includes('chunks/*'), 'Lazy UI chunks must be web accessible')

const optionsHtml = readFileSync(path.join(outputDirectory, 'options.html'), 'utf8')
assert.match(optionsHtml, /<html lang="zh-CN">/)
assert.match(optionsHtml, /<main\b/)
assert.match(optionsHtml, /id="open-boss"/)
assert.match(optionsHtml, /首次使用三步/)
// 只校验本地资源引用；指向文档的外链不在产物里，跳过
for (const match of optionsHtml.matchAll(/(?:src|href)="\/?([^"#?]+)"/g)) {
  const reference = match[1]
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith('//')) continue
  assert.ok(files.includes(reference), `Options references missing file: ${reference}`)
}

const bossEntrypoint = readFileSync(path.join(outputDirectory, 'boss.js'), 'utf8')
const initialChunkMatch = bossEntrypoint.match(/from\s+["']\.\/(chunks\/boss-index-[^"']+\.js)["']/)
assert.ok(initialChunkMatch, 'Chrome boss entrypoint must load an ES module chunk')
const initialChunk = initialChunkMatch[1]
const initialChunkPath = path.join(outputDirectory, ...initialChunk.split('/'))
const initialChunkSource = readFileSync(initialChunkPath, 'utf8')
const initialChunkBytes =
  statSync(initialChunkPath).size + statSync(path.join(outputDirectory, 'boss.js')).size
assert.ok(
  initialChunkBytes < 1_800_000,
  `Initial boss UI exceeds the 1.80 MB raw budget: ${initialChunkBytes} bytes`,
)

for (const feature of ['Config', 'AI', 'Logs', 'About']) {
  assert.ok(
    files.some((file) => new RegExp(`^chunks/boss-${feature}-[^/]+\\.js$`).test(file)),
    `${feature} lazy chunk is missing`,
  )
  assert.match(
    initialChunkSource,
    new RegExp(`import\\(["']\\./boss-${feature}-`),
    `${feature} must be loaded with a dynamic import`,
  )
}

assert.ok(
  (manifest.content_scripts ?? []).some((entry) =>
    entry.js?.includes('content-scripts/content.js'),
  ),
  'Main content script registration is missing',
)
assert.ok(
  (manifest.content_scripts ?? []).some((entry) =>
    entry.js?.includes('content-scripts/chat-socket.js'),
  ),
  'Chat socket content script registration is missing',
)

console.log(
  `built artifact verification passed (initial boss UI ${initialChunkBytes} bytes, ${files.length} files)`,
)
