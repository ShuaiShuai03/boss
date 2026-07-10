import { defineContentScript, injectScript } from '#imports'

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  allFrames: true,
  runAt: 'document_start',
  async main() {
    await injectScript('/chat-socket-main-world.js')
  },
})
