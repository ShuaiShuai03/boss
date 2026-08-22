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
import {
  aiReplyConversationStorageKey,
  aiReplyDraftStorageKey,
} from '@/features/aiReply/draftStorage'

import { readBoundedResponseText } from './boundedResponse'

export const legacyUserStorageKey = 'conf-user'

export interface BackgroundAiResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface BackgroundAiRequest {
  baseUrl: string
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  timeoutMs: number
}
export interface AiReplySessionState {
  drafts?: unknown
  conversations?: unknown
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
const MAX_AI_RESPONSE_BYTES = 25 * 1024 * 1024
const MAX_AI_REQUEST_BODY_BYTES = 5 * 1024 * 1024
const MAX_AI_REPLY_SESSION_BYTES = 2 * 1024 * 1024

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
  async readAiReplySession(): Promise<AiReplySessionState> {
    const values = await browser.storage.session.get([
      aiReplyDraftStorageKey,
      aiReplyConversationStorageKey,
    ])
    return {
      drafts: values[aiReplyDraftStorageKey],
      conversations: values[aiReplyConversationStorageKey],
    }
  }

  async writeAiReplySession(state: AiReplySessionState) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new TypeError('AI 回复会话状态无效')
    }
    const keys = Object.keys(state)
    if (keys.some((key) => key !== 'drafts' && key !== 'conversations')) {
      throw new TypeError('AI 回复会话状态包含未知字段')
    }
    const values: Record<string, unknown> = {}
    if (state.drafts !== undefined) values[aiReplyDraftStorageKey] = state.drafts
    if (state.conversations !== undefined) {
      values[aiReplyConversationStorageKey] = state.conversations
    }
    let serialized: string
    try {
      serialized = JSON.stringify(values)
    } catch {
      throw new TypeError('AI 回复会话状态必须可序列化')
    }
    if (new TextEncoder().encode(serialized).byteLength > MAX_AI_REPLY_SESSION_BYTES) {
      throw new Error('AI 回复会话状态过大')
    }
    if (Object.keys(values).length > 0) await browser.storage.session.set(values)
    return true
  }

  async aiRequest(args: BackgroundAiRequest): Promise<BackgroundAiResponse> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new TypeError('AI 请求参数无效')
    }
    if (
      typeof args.baseUrl !== 'string' ||
      typeof args.url !== 'string' ||
      args.baseUrl.length > 8192 ||
      args.url.length > 8192
    ) {
      throw new TypeError('AI 请求 URL 无效')
    }
    if (args.method !== 'GET' && args.method !== 'POST') {
      throw new TypeError('AI 请求方法不受支持')
    }
    const baseUrl = new URL(normalizeHttpRequestUrl(args.baseUrl))
    const requestUrl = new URL(normalizeHttpRequestUrl(args.url))
    const basePath = baseUrl.pathname.replace(/\/+$/, '')
    if (
      requestUrl.origin !== baseUrl.origin ||
      (basePath &&
        requestUrl.pathname !== basePath &&
        !requestUrl.pathname.startsWith(`${basePath}/`))
    ) {
      throw new Error('AI 请求 URL 不属于已配置的模型 Base URL')
    }
    if (args.body !== undefined && typeof args.body !== 'string') {
      throw new TypeError('AI 请求体无效')
    }
    if (
      args.body !== undefined &&
      new TextEncoder().encode(args.body).byteLength > MAX_AI_REQUEST_BODY_BYTES
    ) {
      throw new Error('AI 请求体过大')
    }
    if (!args.headers || typeof args.headers !== 'object' || Array.isArray(args.headers)) {
      throw new TypeError('AI 请求头无效')
    }
    const headerEntries = Object.entries(args.headers)
    if (
      headerEntries.length > 100 ||
      headerEntries.some(
        ([key, value]) => typeof value !== 'string' || key.length > 256 || value.length > 8192,
      )
    ) {
      throw new Error('AI 请求头超出允许范围')
    }
    if (!Number.isFinite(args.timeoutMs)) throw new TypeError('AI 请求超时无效')
    const timeoutMs = Math.max(1, Math.min(120_000, args.timeoutMs))
    const response = await fetch(requestUrl, {
      method: args.method,
      headers: args.headers,
      body: args.method === 'POST' ? args.body : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      mode: 'cors',
      credentials: 'omit',
    })
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await readBoundedResponseText(response, MAX_AI_RESPONSE_BYTES),
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
