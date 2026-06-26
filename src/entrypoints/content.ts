import { defineContentScript, injectScript } from '#imports'
import { ProvideContentAdapter, provideContentCounter } from '@/message/contentScript'

import './boss/inject.css'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main() {
    provideContentCounter(new ProvideContentAdapter())
    await injectScript('/boss.js', {
      keepInDom: true,
    })
  },
})
