import { browser } from 'wxt/browser'

const bossJobsUrl = 'https://www.zhipin.com/web/geek/job'
const openButton = document.querySelector<HTMLButtonElement>('#open-boss')
const status = document.querySelector<HTMLElement>('#open-status')
const version = document.querySelector<HTMLElement>('#version')

if (version) version.textContent = `v${browser.runtime.getManifest().version}`

openButton?.addEventListener('click', async () => {
  if (!status || !openButton) return
  openButton.disabled = true
  status.textContent = '正在查找已打开的岗位页…'
  try {
    const tabs = await browser.tabs.query({
      url: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
    })
    const existing = tabs.find((tab) => tab.id != null)
    if (existing?.id != null) {
      await browser.tabs.update(existing.id, { active: true })
      if (existing.windowId != null) {
        await browser.windows.update(existing.windowId, { focused: true })
      }
      status.textContent = '已切换到 BOSS 直聘页面。'
    } else {
      await browser.tabs.create({ url: bossJobsUrl })
      status.textContent = '已打开 BOSS 直聘岗位页。'
    }
  } catch (error) {
    status.textContent = `打开失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    openButton.disabled = false
  }
})
