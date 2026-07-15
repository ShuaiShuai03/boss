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
    const isManifestV3 = browser.runtime.getManifest().manifest_version === 3
    let injectedScript: HTMLScriptElement | undefined
    provideContentCounter(new ProvideContentAdapter(bridge))
    try {
      await injectScript('/boss.js', {
        keepInDom: isManifestV3,
        modifyScript(script) {
          injectedScript = script
          if (isManifestV3) script.type = 'module'
          script.dataset.bossHelperBridgeId = bridge.channelId
          script.dataset.bossHelperBridgeToken = bridge.token
        },
      })
    } finally {
      injectedScript?.remove()
    }
  },
})
