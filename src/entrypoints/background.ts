import { browser, defineBackground } from '#imports'
import { initAiReplyBroker } from '@/features/aiReply/broker'
import { ProvideBackgroundAdapter, provideBackgroundCounter } from '@/message/background'

const zhipinTabUrls = ['*://zhipin.com/*', '*://*.zhipin.com/*']

async function reloadOpenZhipinTabs() {
  const tabs = await browser.tabs.query({ url: zhipinTabUrls })
  await Promise.all(tabs.map((tab) => (tab.id ? browser.tabs.reload(tab.id) : Promise.resolve())))
}

export default defineBackground({
  main() {
    provideBackgroundCounter(new ProvideBackgroundAdapter())
    initAiReplyBroker()
    browser.runtime.onInstalled.addListener(() => {
      void reloadOpenZhipinTabs().catch((error) => {
        console.error('刷新 BOSS 页面失败', error)
      })
    })
  },
})
