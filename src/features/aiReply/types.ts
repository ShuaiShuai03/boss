import type { JobData } from '@/composables/useHelper'

export const AI_REPLY_DOM_MESSAGE_EVENT = 'boss-helper:ai-reply-message'

export type AiReplyMessageDirection = 'incoming' | 'outgoing'

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
  peer: AiReplyPeer
  job?: JobData
  messages: AiReplyRealtimeMessage[]
  updatedAt: number
}

export interface AiReplyChatEventPayload {
  url: string
  user: AiReplyPeer
  messages: AiReplyRealtimeMessage[]
}

export interface AiReplySendTarget {
  conversationId: string
  text: string
  toUid: string
  toName?: string
  friendSource?: number
}
