import { browser } from '#imports'

import {
  AI_REPLY_RUNTIME_SOURCE,
  type AiReplyChatEventPayload,
  type AiReplyConversation,
  type AiReplyRuntimeMessage,
  type AiReplySendDraftPayload,
  type AiReplySendTarget,
  isAiReplyRuntimeMessage,
} from './types'

const conversations = new Map<string, AiReplyConversation>()
let updatedAt = Date.now()

function createSnapshot() {
  return {
    conversations: Array.from(conversations.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    updatedAt,
  }
}

function broadcastSnapshot() {
  const message: AiReplyRuntimeMessage = {
    source: AI_REPLY_RUNTIME_SOURCE,
    type: 'snapshot',
    payload: createSnapshot(),
  }
  void browser.runtime.sendMessage(message).catch(() => {})
}

function upsertConversation(payload: AiReplyChatEventPayload, tabId?: number) {
  let changed = false

  for (const message of payload.messages) {
    const existing = conversations.get(message.conversationId)
    const messageExists = existing?.messages.some((item) => item.id === message.id) ?? false

    if (messageExists) {
      continue
    }

    const nextMessages = [...(existing?.messages ?? []), message]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-50)

    conversations.set(message.conversationId, {
      id: message.conversationId,
      tabId,
      tabUrl: payload.url,
      peer: message.peer,
      job: message.job ?? existing?.job,
      messages: nextMessages,
      updatedAt: Date.now(),
    })
    changed = true
  }

  if (changed) {
    updatedAt = Date.now()
    broadcastSnapshot()
  }
}

async function sendDraft(payload: AiReplySendDraftPayload) {
  const conversation = conversations.get(payload.conversationId)
  if (!conversation) {
    throw new Error('会话不存在或已过期')
  }
  if (conversation.tabId == null) {
    throw new Error('找不到可发送消息的 Boss 页面')
  }
  const text = payload.text.trim()
  if (!text) {
    throw new Error('回复内容为空')
  }
  if (!conversation.peer.uid) {
    throw new Error('缺少 Boss/HR 用户 ID')
  }

  const target: AiReplySendTarget = {
    conversationId: payload.conversationId,
    text,
    toUid: conversation.peer.uid,
    toName: conversation.peer.name,
    friendSource: conversation.peer.source,
  }
  const message: AiReplyRuntimeMessage = {
    source: AI_REPLY_RUNTIME_SOURCE,
    type: 'content-send-draft',
    payload: target,
  }
  const result = (await browser.tabs.sendMessage(conversation.tabId, message)) as
    | { ok: boolean; error?: string }
    | undefined

  if (!result?.ok) {
    throw new Error(result?.error ?? '发送失败')
  }

  const optimisticMessage = {
    id: `draft:${Date.now()}`,
    conversationId: conversation.id,
    direction: 'outgoing' as const,
    text,
    timestamp: Date.now(),
    sender: { uid: 'me', name: '我' },
    recipient: conversation.peer,
    peer: conversation.peer,
    job: conversation.job,
  }

  conversations.set(conversation.id, {
    ...conversation,
    messages: [...conversation.messages, optimisticMessage].slice(-50),
    updatedAt: Date.now(),
  })
  updatedAt = Date.now()
  broadcastSnapshot()
}

export function initAiReplyBroker() {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (!isAiReplyRuntimeMessage(message)) {
      return
    }

    if (message.type === 'chat-event') {
      upsertConversation(message.payload, sender.tab?.id)
      return Promise.resolve({ ok: true })
    }

    if (message.type === 'get-snapshot') {
      return Promise.resolve({ ok: true, snapshot: createSnapshot() })
    }

    if (message.type === 'send-draft') {
      return sendDraft(message.payload)
        .then(() => ({ ok: true }))
        .catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }))
    }
  })
}
