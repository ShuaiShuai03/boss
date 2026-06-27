import { defineContentScript, injectScript } from '#imports'
import {
  createContentBridgeOptions,
  ProvideContentAdapter,
  provideContentCounter,
} from '@/message/contentScript'

import './boss/inject.css'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main() {
    const bridge = createContentBridgeOptions()
    provideContentCounter(new ProvideContentAdapter(bridge))
    await injectScript('/boss.js', {
      modifyScript(script) {
        script.dataset.bossHelperBridgeId = bridge.channelId
        script.dataset.bossHelperBridgeToken = bridge.token
      },
    })
  },
})
