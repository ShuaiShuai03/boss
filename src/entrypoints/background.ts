import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'

import {
  normalizeWorkflowRunCheckpoint,
  workflowRunIsStale,
  workflowRunRawStorageKey,
} from '../composables/useApplying/runState'
import { ProvideBackgroundAdapter, provideBackgroundCounter } from '../message/background'

const zhipinTabUrls = ['*://zhipin.com/*', '*://*.zhipin.com/*']
const workflowWatchdogAlarm = 'boss-helper-workflow-watchdog'
const workflowOwnerRequestType = 'boss-helper:get-workflow-owner-id'

async function reloadOpenZhipinTabs() {
  const tabs = await browser.tabs.query({ url: zhipinTabUrls })
  await Promise.all(tabs.map((tab) => (tab.id ? browser.tabs.reload(tab.id) : Promise.resolve())))
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

export default defineBackground({
  main() {
    provideBackgroundCounter(new ProvideBackgroundAdapter())
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
      if (sender.tab?.id == null) throw new Error('工作流消息缺少标签页来源')
      return Promise.resolve({ ownerId: `tab:${sender.tab.id}:runtime:${message.runtimeId}` })
    })
    browser.runtime.onInstalled.addListener(() => {
      void reloadOpenZhipinTabs().catch((error) => {
        console.error('刷新 BOSS 页面失败', error)
      })
    })
  },
})
