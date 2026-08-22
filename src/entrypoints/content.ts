import { defineContentScript } from '#imports'
import { bossPageGateway } from '@/message/pageGateway'

import { disposeBossHelperRuntime, reconcileBossHelperRuntime, runBossHelper } from './boss/main'

import './boss/inject.css'

export default defineContentScript({
  matches: ['*://zhipin.com/web/geek/job*', '*://*.zhipin.com/web/geek/job*'],
  async main() {
    await bossPageGateway.start()
    await runBossHelper(bossPageGateway)
    const handleRuntimeMessage = (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'boss-helper:workflow-watchdog'
      ) {
        void reconcileBossHelperRuntime('watchdog')
      }
    }
    browser.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      browser.runtime.onMessage.removeListener(handleRuntimeMessage)
      bossPageGateway.dispose()
      void disposeBossHelperRuntime('content_dispose')
    }
  },
})
