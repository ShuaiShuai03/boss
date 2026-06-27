import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const gitignore = read('.gitignore')
assert.match(gitignore, /^\.agents\/$/m)
assert.match(gitignore, /^\/简历\.pdf$/m)

const manifestConfig = read('wxt.config.ts')
assert.doesNotMatch(manifestConfig, /permissions:\s*\[[^\]]*['"]cookies['"]/)

const contentEntrypoint = read('src/entrypoints/content.ts')
assert.match(contentEntrypoint, /createContentBridgeOptions/)
assert.match(contentEntrypoint, /provideContentCounter/)
assert.match(contentEntrypoint, /injectScript\(['"]\/boss\.js['"]/)
assert.match(contentEntrypoint, /bossHelperBridgeToken/)
assert.doesNotMatch(contentEntrypoint, /world:\s*['"]MAIN['"]/)

const contentScriptShare = read('src/message/contentScriptShare.ts')
assert.match(contentScriptShare, /cryptoApi\.randomUUID|cryptoApi\.getRandomValues/)
assert.match(contentScriptShare, /boss-helper:content:\$\{channelId\}/)
assert.doesNotMatch(contentScriptShare, /boss-helper:injector-message|boss-helper:provider-message/)
assert.doesNotMatch(contentScriptShare, /doc\.addEventListener\(['"]message['"]/)

const bossIndex = read('src/entrypoints/boss/index.ts')
assert.match(bossIndex, /defineUnlistedScript/)
assert.match(bossIndex, /runBossHelper/)

const bossEntrypoint = read('src/entrypoints/boss/main.ts')
assert.match(bossEntrypoint, /export async function runBossHelper/)
assert.doesNotMatch(bossEntrypoint, /defineUnlistedScript|defineContentScript/)
assert.doesNotMatch(bossEntrypoint, /initGeekChatBridge/)

const messageIndex = read('src/message/index.ts')
assert.match(messageIndex, /readInjectedContentBridgeOptions/)
assert.match(messageIndex, /new InjectContentAdapter/)
assert.doesNotMatch(messageIndex, /InjectBackgroundAdapter/)

const chatCore = read('src/composables/useWebSocket/chatCore.ts')
assert.doesNotMatch(chatCore, /window\.addEventListener\(['"]message['"]/)
assert.doesNotMatch(chatCore, /initGeekChatBridge/)

const protobuf = read('src/composables/useWebSocket/protobuf.ts')
assert.match(protobuf, /sendChatByGeekChatCore/)
assert.doesNotMatch(protobuf, /window\.postMessage/)

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
assert.match(background, /normalizeHttpRequestUrl/)
assert.match(background, /仅支持 HTTPS 请求，HTTP 仅允许本机地址/)

console.log('bridge hardening verification passed')
