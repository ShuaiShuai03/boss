// Bounds AI_REPLY_DOM_MESSAGE_EVENT before ChatBox.vue displays or routes it. The event is
// dispatched on `document` by chat-socket-main-world.ts, so any host-page script can forge the
// same event. This parser is deliberately not a capability boundary: it only rejects malformed
// or oversized data, and consumers must never let the event automatically invoke model, storage,
// network, workflow, or chat-send operations.

import type { AiReplyChatEventPayload, AiReplyPeer, AiReplyRealtimeMessage } from './types'

const MAX_MESSAGES_PER_EVENT = 50
const MAX_TEXT_LENGTH = 4000
const MAX_STRING_FIELD_LENGTH = 500
const MAX_AVATAR_LENGTH = 2000

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function isValidPeer(value: unknown): value is AiReplyPeer {
  if (value == null || typeof value !== 'object') return false
  const peer = value as Record<string, unknown>
  if (!isBoundedString(peer.uid, MAX_STRING_FIELD_LENGTH)) return false
  if (peer.name != null && !isBoundedString(peer.name, MAX_STRING_FIELD_LENGTH)) return false
  if (peer.avatar != null && !isBoundedString(peer.avatar, MAX_AVATAR_LENGTH)) return false
  if (peer.company != null && !isBoundedString(peer.company, MAX_STRING_FIELD_LENGTH)) return false
  if (peer.source != null && typeof peer.source !== 'number') return false
  return true
}

// JobData has many fields; only the invariant the rest of the app actually depends on (a
// non-empty string `key`, used as a Map key throughout) is enforced here rather than
// re-implementing its full schema.
function isValidJobRef(value: unknown): boolean {
  if (value == null) return true
  return (
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).key === 'string' &&
    (value as Record<string, unknown>).key !== ''
  )
}

function isValidMessage(value: unknown): value is AiReplyRealtimeMessage {
  if (value == null || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    isBoundedString(message.id, MAX_STRING_FIELD_LENGTH) &&
    message.id !== '' &&
    isBoundedString(message.conversationId, MAX_STRING_FIELD_LENGTH) &&
    message.conversationId !== '' &&
    (message.direction === 'incoming' || message.direction === 'outgoing') &&
    isBoundedString(message.text, MAX_TEXT_LENGTH) &&
    typeof message.timestamp === 'number' &&
    Number.isFinite(message.timestamp) &&
    isValidPeer(message.sender) &&
    isValidPeer(message.recipient) &&
    isValidPeer(message.peer) &&
    isValidJobRef(message.job)
  )
}

// Returns a payload with only well-formed messages (oversized batches truncated), or null if the
// payload itself isn't a plausible AiReplyChatEventPayload at all.
export function sanitizeAiReplyChatEventPayload(value: unknown): AiReplyChatEventPayload | null {
  if (value == null || typeof value !== 'object') return null
  const payload = value as Record<string, unknown>
  if (typeof payload.url !== 'string') return null
  if (!isValidPeer(payload.user)) return null
  if (!Array.isArray(payload.messages)) return null

  const messages = payload.messages.filter(isValidMessage).slice(0, MAX_MESSAGES_PER_EVENT)
  if (messages.length === 0) return null

  return { url: payload.url, user: payload.user as AiReplyPeer, messages }
}
