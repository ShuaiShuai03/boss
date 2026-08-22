import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}
function exists(path) {
  return existsSync(new URL(`../${path}`, import.meta.url))
}

const gitignore = read('.gitignore')
assert.match(gitignore, /^\.agents\/$/m)
assert.match(gitignore, /^\/简历\.pdf$/m)

const manifestConfig = read('wxt.config.ts')
assert.doesNotMatch(manifestConfig, /permissions:\s*\[[^\]]*['"]cookies['"]/)
assert.match(manifestConfig, /permissions:\s*\[[^\]]*['"]scripting['"]/)
assert.match(manifestConfig, /resources:\s*\[['"]chat-socket-main-world\.js['"]\]/)
assert.doesNotMatch(manifestConfig, /boss\.js/)

const contentEntrypoint = read('src/entrypoints/content.ts')
assert.match(contentEntrypoint, /bossPageGateway\.start\(\)/)
assert.match(contentEntrypoint, /runBossHelper\(bossPageGateway\)/)
assert.doesNotMatch(
  contentEntrypoint,
  /injectScript|provideContentCounter|bossHelperBridgeToken|boss\.js|world:\s*['"]MAIN['"]/,
)
const uiMount = read('src/index.ts')
assert.match(
  uiMount,
  /mode:\s*__BOSS_HELPER_TEST_OPEN_SHADOW__\s*\?\s*['"]open['"]\s*:\s*['"]closed['"]/,
)
const appComponent = read('src/App.vue')
assert.match(appComponent, /<UApp\s+:portal="container"/)

for (const legacyPath of [
  'src/message/contentScriptShare.ts',
  'src/entrypoints/boss/index.ts',
  'src/composables/useWebSocket/chatCore.ts',
  'src/composables/useVue.ts',
]) {
  assert.equal(exists(legacyPath), false, `${legacyPath} must remain deleted`)
}

const bossEntrypoint = read('src/entrypoints/boss/main.ts')
assert.match(bossEntrypoint, /export async function runBossHelper\(gateway: BossPageGateway\)/)
assert.doesNotMatch(
  bossEntrypoint,
  /defineUnlistedScript|defineContentScript|window\._PAGE|rootVue|useHookVue|_pageChange|_clickJobCardAction/,
)

const messageIndex = read('src/message/index.ts')
assert.match(messageIndex, /new ContentCounter/)
assert.match(messageIndex, /new InjectBackgroundAdapter/)
assert.doesNotMatch(messageIndex, /InjectContentAdapter|readInjectedContentBridgeOptions/)

const contentCounter = read('src/message/contentScript.ts')
assert.doesNotMatch(
  contentCounter,
  /async\s+(?:request|rawRequest|sessionStorageGet|sessionStorageSet)\s*\(/,
)

const pageProtocol = read('src/message/pageProtocol.ts')
for (const type of ['page-snapshot', 'page-change', 'page-select-job', 'page-send-chat']) {
  assert.match(pageProtocol, new RegExp(`boss-helper:${type}`))
}
assert.match(pageProtocol, /parseBossPageRequest/)
assert.doesNotMatch(pageProtocol, /storageGet|storageSet|storageRm|rawRequest|aiRequest/)

const pageOperations = read('src/message/pageOperations.ts')
assert.match(pageOperations, /browser\.scripting\.executeScript/)
assert.match(pageOperations, /world:\s*['"]MAIN['"]/)
assert.match(pageOperations, /collectBossSnapshotInMain/)
assert.match(pageOperations, /changeBossPageInMain/)
assert.match(pageOperations, /selectBossJobInMain/)
assert.match(pageOperations, /sendBossChatInMain/)

const protobuf = read('src/composables/useWebSocket/protobuf.ts')
assert.match(protobuf, /bossPageGateway\.sendChat/)
assert.doesNotMatch(protobuf, /window\.(?:postMessage|ChatWebsocket|socket)/)

const chatBridge = read('src/composables/useWebSocket/chatBridge.ts')
assert.doesNotMatch(chatBridge, /BOSS_HELPER_CHAT_BRIDGE|boss_helper_chat_send/)

const useModelIndex = read('src/composables/useModel/index.ts')
assert.match(useModelIndex, /summarizeModelConfForLog/)
assert.doesNotMatch(useModelIndex, /logger\.debug\(['"]ai模型数据['"],\s*localData\)/)

const confIndex = read('src/composables/conf/index.ts')
assert.match(confIndex, /summarizeFormDataForLog/)
assert.doesNotMatch(
  confIndex,
  /logger\.debug\(['"]formData(?:改变|保存)['"],\s*(?:toRaw\(v\)|payload\.formData)\)/,
)

const openaiUtils = read('src/composables/useModel/openai-utils.ts')
assert.match(openaiUtils, /Base URL 仅支持 https:\/\/，http:\/\/ 仅允许本机地址/)

const background = read('src/message/background.ts')
assert.match(background, /async aiRequest/)
assert.match(background, /normalizeHttpRequestUrl/)
assert.match(background, /仅支持 HTTPS 请求，HTTP 仅允许本机地址/)
assert.match(background, /readBoundedResponseText/)
assert.doesNotMatch(background, /body:\s*await res\.text\(\)/)
assert.doesNotMatch(
  background,
  /async\s+(?:request|rawRequest|sessionStorageGet|sessionStorageSet)\s*\(/,
)

const backgroundEntrypoint = read('src/entrypoints/background.ts')
assert.match(backgroundEntrypoint, /parseBossPageRequest/)
assert.match(backgroundEntrypoint, /isAllowedBossPageSender/)
assert.match(backgroundEntrypoint, /sender\.frameId !== 0/)
assert.match(backgroundEntrypoint, /legacyUserStorageKey/)
assert.match(backgroundEntrypoint, /storage\.local\.remove/)
console.log('bridge hardening verification passed')
