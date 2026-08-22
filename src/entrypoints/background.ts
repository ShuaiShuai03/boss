import { type Browser, browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

import {
  normalizeWorkflowRunCheckpoint,
  workflowRunIsStale,
  workflowRunRawStorageKey,
} from '../composables/useApplying/runState'
import {
  legacyUserStorageKey,
  ProvideBackgroundAdapter,
  provideBackgroundCounter,
} from '../message/background'
import { executeBossPageOperation } from '../message/pageOperations'
import { parseBossPageRequest } from '../message/pageProtocol'
const zhipinTabUrls = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const workflowWatchdogAlarm = 'boss-helper-workflow-watchdog'
const workflowOwnerRequestType = 'boss-helper:get-workflow-owner-id'

async function reloadOpenZhipinTabs() {
  const tabs = await browser.tabs.query({ url: zhipinTabUrls })
  for (const tab of tabs) {
    if (tab.id == null) continue
    await browser.tabs.reload(tab.id)
  }
}

async function ensureWorkflowWatchdog() {
  const existing = await browser.alarms.get(workflowWatchdogAlarm)
  if (!existing) {
    await browser.alarms.create(workflowWatchdogAlarm, { periodInMinutes: 1 })
  }
}

async function wakeStaleWorkflow() {
  const stored = await browser.storage.local.get(workflowRunRawStorageKey)
  const checkpoint = normalizeWorkflowRunCheckpoint(stored[workflowRunRawStorageKey])
  if (
    !checkpoint ||
    checkpoint.intent !== 'running' ||
    !workflowRunIsStale(checkpoint, Date.now())
  ) {
    return
  }

  const tabs = await browser.tabs.query({ url: zhipinTabUrls })
  console.info('检测到陈旧工作流租约，唤醒 BOSS 页面恢复器', { tabCount: tabs.length })
  await Promise.allSettled(
    tabs.map((tab) =>
      tab.id
        ? browser.tabs.sendMessage(tab.id, { type: 'boss-helper:workflow-watchdog' })
        : Promise.resolve(),
    ),
  )
}
function isAllowedBossPageSender(sender: Browser.runtime.MessageSender) {
  if (sender.id !== browser.runtime.id || sender.tab?.id == null || sender.frameId !== 0)
    return false
  const rawUrl = sender.url ?? sender.tab.url
  if (!rawUrl) return false
  try {
    const url = new URL(rawUrl)
    const hostname = url.hostname.toLowerCase()
    return (
      (hostname === 'zhipin.com' || hostname.endsWith('.zhipin.com')) &&
      url.pathname.startsWith('/web/geek/job')
    )
  } catch {
    return false
  }
}

export default defineBackground({
  main() {
    provideBackgroundCounter(new ProvideBackgroundAdapter())
    void browser.storage.local.remove(legacyUserStorageKey).catch((error) => {
      console.error('清理旧版账号 Cookie 数据失败', error)
    })
    void ensureWorkflowWatchdog().catch((error) => {
      console.error('创建工作流看门狗失败', error)
    })
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name !== workflowWatchdogAlarm) return
      void wakeStaleWorkflow().catch((error) => {
        console.error('工作流看门狗执行失败', error)
      })
    })
    browser.runtime.onMessage.addListener((message, sender) => {
      const pageRequest = parseBossPageRequest(message)
      if (pageRequest) {
        if (!isAllowedBossPageSender(sender)) {
          return Promise.resolve({ ok: false, error: '页面操作来源不受信任' })
        }
        const tabId = sender.tab?.id
        if (tabId == null) return Promise.resolve({ ok: false, error: '页面操作缺少标签页 ID' })
        return executeBossPageOperation(pageRequest, tabId)
          .then((value) => ({ ok: true, value }))
          .catch((error) => ({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }))
      }
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message) ||
        message.type !== workflowOwnerRequestType ||
        !('runtimeId' in message) ||
        typeof message.runtimeId !== 'string' ||
        message.runtimeId.length === 0 ||
        message.runtimeId.length > 128
      ) {
        return
      }
      if (!isAllowedBossPageSender(sender)) {
        throw new Error('工作流消息缺少可信标签页来源')
      }
      const tabId = sender.tab?.id
      if (tabId == null) throw new Error('工作流消息缺少标签页 ID')
      return Promise.resolve({ ownerId: `tab:${tabId}:runtime:${message.runtimeId}` })
    })
    browser.runtime.onInstalled.addListener(() => {
      void reloadOpenZhipinTabs().catch((error) => {
        console.error('刷新 BOSS 页面失败', error)
      })
    })
  },
})
