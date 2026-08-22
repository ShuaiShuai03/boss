import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'

import type { StorageItemKey } from '#imports'
import { storage } from '#imports'

import type { BackgroundCounter } from './background'

export const [, injectBackgroundCounter] = defineProxy(() => ({}) as BackgroundCounter, {
  namespace: '__boss-helper-background__',
})

function genKey(key: string): StorageItemKey {
  const prefixes = ['local:', 'session:', 'sync:', 'managed:'] as const
  return prefixes.some((prefix) => key.startsWith(prefix)) ? (key as StorageItemKey) : `sync:${key}`
}

export class ContentCounter {
  public background: BackgroundCounter

  constructor(background: BackgroundCounter) {
    this.background = background
  }

  async notify(...args: Parameters<BackgroundCounter['notify']>) {
    return this.background.notify(...args)
  }

  async backgroundTest(...args: Parameters<BackgroundCounter['backgroundTest']>) {
    return this.background.backgroundTest(...args)
  }

  async getWorkflowOwnerId(runtimeId: string) {
    const response = await browser.runtime.sendMessage({
      type: 'boss-helper:get-workflow-owner-id',
      runtimeId,
    })
    if (
      typeof response !== 'object' ||
      response === null ||
      !('ownerId' in response) ||
      typeof response.ownerId !== 'string'
    ) {
      throw new Error('无法确定工作流所在标签页')
    }
    return response.ownerId
  }

  async readWorkflowRun(...args: Parameters<BackgroundCounter['readWorkflowRun']>) {
    return this.background.readWorkflowRun(...args)
  }

  async claimWorkflowRun(...args: Parameters<BackgroundCounter['claimWorkflowRun']>) {
    return this.background.claimWorkflowRun(...args)
  }

  async updateWorkflowRun(...args: Parameters<BackgroundCounter['updateWorkflowRun']>) {
    return this.background.updateWorkflowRun(...args)
  }

  async pauseWorkflowRun(...args: Parameters<BackgroundCounter['pauseWorkflowRun']>) {
    return this.background.pauseWorkflowRun(...args)
  }

  async resetWorkflowRunFilters(...args: Parameters<BackgroundCounter['resetWorkflowRunFilters']>) {
    return this.background.resetWorkflowRunFilters(...args)
  }
  async aiRequest(...args: Parameters<BackgroundCounter['aiRequest']>) {
    return this.background.aiRequest(...args)
  }

  async readAiReplySession(...args: Parameters<BackgroundCounter['readAiReplySession']>) {
    return this.background.readAiReplySession(...args)
  }

  async writeAiReplySession(...args: Parameters<BackgroundCounter['writeAiReplySession']>) {
    return this.background.writeAiReplySession(...args)
  }

  async storageGet<T>(key: string, defaultValue: T): Promise<T>
  async storageGet<T>(key: string): Promise<T | null>
  async storageGet<T>(key: string, defaultValue?: T): Promise<T | null> {
    return storage.getItem<T>(genKey(key), { fallback: defaultValue })
  }

  async storageSet<T>(key: string, value: T) {
    await storage.setItem(genKey(key), value)
    return true
  }
  async storageSetItems(items: Array<{ key: string; value: unknown }>) {
    await storage.setItems(
      items.map(({ key, value }) => ({
        key: genKey(key),
        value,
      })),
    )
    return true
  }

  async storageRm(key: string) {
    await storage.removeItem(genKey(key))
    return true
  }

  async contentScriptTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`test error date: ${Date.now()}`)
    }
    return Date.now()
  }
}

interface MessageMeta {
  url: string
}

export class InjectBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    return browser.runtime.sendMessage(browser.runtime.id, {
      ...message,
      meta: { url: document.location.href },
    })
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}
