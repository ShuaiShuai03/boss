import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'
import { defineProxy } from 'comctx'
import { type Browser, browser } from 'wxt/browser'

import {
  claimWorkflowRun,
  forcePauseWorkflowRun,
  normalizeWorkflowRunCheckpoint,
  resetWorkflowRunFilters,
  resumePausedWorkflowRun,
  workflowRunRawStorageKey,
  type WorkflowRunCheckpoint,
  type WorkflowRunClaim,
} from '@/composables/useApplying/runState'

import { readBoundedResponseText } from './boundedResponse'

export const userKey = 'local:conf-user'

type BackgroundResponseType = 'text' | 'json' | 'arraybuffer' | 'blob' | 'document' | 'stream'

export interface BackgroundRawResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface BackgroundRawRequest {
  url: string
  data?: {
    method?: string
    headers?: Record<string, string>
    body?: string | null
  }
  timeout?: number
}

let workflowRunMutation = Promise.resolve()

function mutateWorkflowRun<T>(mutation: () => Promise<T>) {
  const result = workflowRunMutation.catch(() => undefined).then(mutation)
  workflowRunMutation = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// A malicious or misbehaving endpoint returning an unbounded body would otherwise be fully
// buffered here as text and then re-buffered again when useModel/openai.ts reconstructs a
// Response from it, risking a memory spike, added latency, or the MV3 worker being restarted
// (BH-NET-01). 25MB comfortably covers any realistic model completion/listing payload.
const MAX_RAW_RESPONSE_BYTES = 25 * 1024 * 1024

function normalizeHttpRequestUrl(url: string) {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol === 'https:') {
    return parsedUrl.toString()
  }
  if (
    parsedUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname.toLowerCase())
  ) {
    return parsedUrl.toString()
  }
  throw new Error('仅支持 HTTPS 请求，HTTP 仅允许本机地址')
}

export class BackgroundCounter {
  async readWorkflowRun() {
    const stored = await browser.storage.local.get(workflowRunRawStorageKey)
    return normalizeWorkflowRunCheckpoint(stored[workflowRunRawStorageKey])
  }

  async claimWorkflowRun(
    claim: WorkflowRunClaim,
    now: number,
    resumePaused = false,
  ): Promise<{ claimed: boolean; checkpoint: WorkflowRunCheckpoint }> {
    return mutateWorkflowRun(async () => {
      const stored = await browser.storage.local.get(workflowRunRawStorageKey)
      const current = stored[workflowRunRawStorageKey]
      const normalized = normalizeWorkflowRunCheckpoint(current)
      const result =
        resumePaused && normalized?.intent === 'paused'
          ? { claimed: true, checkpoint: resumePausedWorkflowRun(current, claim, now) }
          : claimWorkflowRun(current, claim, now)
      if (result.claimed) {
        await browser.storage.local.set({ [workflowRunRawStorageKey]: result.checkpoint })
      }
      return result
    })
  }

  async updateWorkflowRun(
    runId: string,
    ownerId: string,
    nextValue: WorkflowRunCheckpoint,
  ): Promise<{ updated: boolean; checkpoint: WorkflowRunCheckpoint | null }> {
    return mutateWorkflowRun(async () => {
      const stored = await browser.storage.local.get(workflowRunRawStorageKey)
      const current = normalizeWorkflowRunCheckpoint(stored[workflowRunRawStorageKey])
      const next = normalizeWorkflowRunCheckpoint(nextValue)
      if (
        !current ||
        !next ||
        current.runId !== runId ||
        current.ownerId !== ownerId ||
        next.runId !== runId
      ) {
        return { updated: false, checkpoint: current }
      }
      await browser.storage.local.set({ [workflowRunRawStorageKey]: next })
      return { updated: true, checkpoint: next }
    })
  }

  async pauseWorkflowRun(accountId: string, now: number) {
    return mutateWorkflowRun(async () => {
      const stored = await browser.storage.local.get(workflowRunRawStorageKey)
      const checkpoint = forcePauseWorkflowRun(stored[workflowRunRawStorageKey], accountId, now)
      if (checkpoint) {
        await browser.storage.local.set({ [workflowRunRawStorageKey]: checkpoint })
      }
      return checkpoint
    })
  }

  async resetWorkflowRunFilters(accountId: string, now: number) {
    return mutateWorkflowRun(async () => {
      const stored = await browser.storage.local.get(workflowRunRawStorageKey)
      const checkpoint = resetWorkflowRunFilters(stored[workflowRunRawStorageKey], accountId, now)
      if (checkpoint) {
        await browser.storage.local.set({ [workflowRunRawStorageKey]: checkpoint })
      }
      return checkpoint
    })
  }

  async sessionStorageGet<T>(key: string, defaultValue: T): Promise<T> {
    const value = await browser.storage.session.get(key)
    return (value[key] as T | undefined) ?? defaultValue
  }

  async sessionStorageSet<T>(key: string, value: T) {
    await browser.storage.session.set({ [key]: value })
    return true
  }

  async request(args: {
    url: string
    data: RequestInit
    timeout: number
    responseType: BackgroundResponseType
  }) {
    console.log('request', args)
    const signal = AbortSignal.timeout(args.timeout * 1000)
    const url = normalizeHttpRequestUrl(args.url)

    const res = await fetch(url, {
      ...args.data,
      signal,
      mode: 'cors',
      credentials: 'include',
    }).then(async (res) => {
      console.log('request res', res)

      if (!res.ok || res.status >= 400) {
        const errorText = await res.text()
        throw new Error(`状态码: ${res.status}: ${errorText}`)
      }

      const result = args.responseType === 'json' ? await res.json() : await res.text()

      return result
    })
    return res
  }

  async rawRequest(args: BackgroundRawRequest): Promise<BackgroundRawResponse> {
    const signal = AbortSignal.timeout(args.timeout ?? 60000)
    const url = normalizeHttpRequestUrl(args.url)
    const res = await fetch(url, {
      method: args.data?.method ?? 'GET',
      headers: args.data?.headers,
      body: args.data?.body,
      signal,
      mode: 'cors',
      credentials: 'omit',
    })

    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: await readBoundedResponseText(res, MAX_RAW_RESPONSE_BYTES),
    }
  }

  async notify(args: Browser.notifications.NotificationCreateOptions) {
    await browser.notifications.create({
      type: args.type,
      iconUrl: args.iconUrl,
      title: args.title,
      message: args.message,
    })
    return true
  }

  async backgroundTest(type: 'success' | 'error') {
    if (type === 'error') {
      throw new Error(`background test error date: ${Date.now()}`)
    }
    return Date.now()
  }

  async fetch(...args: Parameters<typeof fetch>) {
    return await fetch(...args)
  }
}

interface MessageMeta {
  url: string
}

export class ProvideBackgroundAdapter implements Adapter<MessageMeta> {
  sendMessage: SendMessage<MessageMeta> = async (message) => {
    const tabs = await browser.tabs.query({ url: message.meta.url })
    tabs.map((tab) => void browser.tabs.sendMessage(tab.id!, message))
  }

  onMessage: OnMessage<MessageMeta> = (callback) => {
    const handler = (message?: Partial<Message<MessageMeta>>) => {
      callback(message)
    }
    browser.runtime.onMessage.addListener(handler)
    return () => browser.runtime.onMessage.removeListener(handler)
  }
}

export const [provideBackgroundCounter] = defineProxy(() => new BackgroundCounter(), {
  namespace: '__boss-helper-background__',
})
