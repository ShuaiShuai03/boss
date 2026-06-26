import type { JobData } from '@/composables/useHelper'

export const AI_REPLY_RUNTIME_SOURCE = 'boss-helper:ai-reply'
export const AI_REPLY_DOM_MESSAGE_EVENT = 'boss-helper:ai-reply-message'
export const AI_REPLY_DOM_COMMAND_EVENT = 'boss-helper:ai-reply-command'
export const AI_REPLY_DOM_COMMAND_RESULT_EVENT = 'boss-helper:ai-reply-command-result'

export type AiReplyMessageDirection = 'incoming' | 'outgoing'
export type AiReplyDraftStatus = 'idle' | 'generating' | 'ready' | 'error' | 'sent'

export interface AiReplyPeer {
  uid: string
  name?: string
  avatar?: string
  company?: string
  source?: number
}

export interface AiReplyRealtimeMessage {
  id: string
  conversationId: string
  direction: AiReplyMessageDirection
  text: string
  timestamp: number
  sender: AiReplyPeer
  recipient: AiReplyPeer
  peer: AiReplyPeer
  job?: JobData
}

export interface AiReplyConversation {
  id: string
  tabId?: number
  tabUrl?: string
  peer: AiReplyPeer
  job?: JobData
  messages: AiReplyRealtimeMessage[]
  updatedAt: number
}

export interface AiReplySnapshot {
  conversations: AiReplyConversation[]
  updatedAt: number
}

export interface AiReplyDraft {
  status: AiReplyDraftStatus
  text: string
  editableText: string
  prompt?: string
  reasoning?: string | null
  error?: string
  generatedForMessageId?: string
  updatedAt: number
}

export interface AiReplyChatEventPayload {
  url: string
  user: AiReplyPeer
  messages: AiReplyRealtimeMessage[]
}

export interface AiReplySendDraftPayload {
  conversationId: string
  text: string
}

export interface AiReplySendTarget {
  conversationId: string
  text: string
  toUid: string
  toName?: string
  friendSource?: number
}

export interface AiReplyCommandResult {
  requestId: string
  ok: boolean
  error?: string
}

export type AiReplyRuntimeMessage =
  | {
      source: typeof AI_REPLY_RUNTIME_SOURCE
      type: 'chat-event'
      payload: AiReplyChatEventPayload
    }
  | {
      source: typeof AI_REPLY_RUNTIME_SOURCE
      type: 'get-snapshot'
    }
  | {
      source: typeof AI_REPLY_RUNTIME_SOURCE
      type: 'snapshot'
      payload: AiReplySnapshot
    }
  | {
      source: typeof AI_REPLY_RUNTIME_SOURCE
      type: 'send-draft'
      payload: AiReplySendDraftPayload
    }
  | {
      source: typeof AI_REPLY_RUNTIME_SOURCE
      type: 'content-send-draft'
      payload: AiReplySendTarget
    }

export interface AiReplyDomCommand {
  requestId: string
  type: 'send-draft'
  payload: AiReplySendTarget
}

export function isAiReplyRuntimeMessage(value: unknown): value is AiReplyRuntimeMessage {
  return (
    typeof value === 'object' &&
    value != null &&
    'source' in value &&
    (value as { source?: unknown }).source === AI_REPLY_RUNTIME_SOURCE &&
    'type' in value
  )
}
