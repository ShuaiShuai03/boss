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
assert.ok(accessiblePatterns.includes('chat-socket-main-world.js'))
assert.ok(!accessiblePatterns.includes('boss.js'), 'Privileged boss.js must not be page-accessible')
assert.ok(!files.includes('boss.js'), 'Privileged boss.js artifact must not be emitted')

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

const contentBundlePath = path.join(outputDirectory, 'content-scripts/content.js')
const contentBundleBytes = statSync(contentBundlePath).size
assert.ok(
  contentBundleBytes < 2_000_000,
  `Isolated content UI exceeds the 2.00 MB raw budget: ${contentBundleBytes} bytes`,
)
const contentBundle = readFileSync(contentBundlePath, 'utf8')
assert.match(contentBundle, /__boss-helper-background__/)
assert.doesNotMatch(contentBundle, /boss-helper:content:.*:injector/)
assert.doesNotMatch(contentBundle, /bossHelperBridgeToken/)
assert.ok(
  files.every((file) => !/^chunks\/boss-(?:index|Config|AI|Logs|About)-/.test(file)),
  'Legacy page-accessible boss UI chunks must not be emitted',
)

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
  `built artifact verification passed (isolated content UI ${contentBundleBytes} bytes, ${files.length} files)`,
)
