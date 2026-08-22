import type { AiReplyConversation } from './types'

export const aiReplyDraftStorageKey = 'boss-helper-ai-reply-drafts'
export const aiReplyConversationStorageKey = 'boss-helper-ai-reply-conversations'
export const aiReplyDraftTtlMs = 24 * 60 * 60 * 1000
export interface StoredReplyDraft {
  text: string
  dirty: boolean
  updatedAt: number
}

export function serializeReplyDrafts(
  drafts: Iterable<readonly [string, StoredReplyDraft]>,
): Record<string, StoredReplyDraft> {
  const stored: Record<string, StoredReplyDraft> = {}
  for (const [conversationId, draft] of drafts) {
    if (!draft.text.trim()) continue
    stored[conversationId] = {
      text: draft.text,
      dirty: draft.dirty,
      updatedAt: draft.updatedAt,
    }
  }
  return stored
}

export function sanitizeStoredReplyDrafts(
  value: unknown,
  now = Date.now(),
): Record<string, StoredReplyDraft> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const drafts: Record<string, StoredReplyDraft> = {}
  for (const [conversationId, draft] of Object.entries(value)) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) continue
    const candidate = draft as Partial<StoredReplyDraft>
    if (
      typeof candidate.text !== 'string' ||
      !candidate.text.trim() ||
      typeof candidate.updatedAt !== 'number' ||
      !Number.isFinite(candidate.updatedAt) ||
      candidate.updatedAt > now ||
      now - candidate.updatedAt > aiReplyDraftTtlMs
    ) {
      continue
    }
    drafts[conversationId] = {
      text: candidate.text,
      dirty: candidate.dirty === true,
      updatedAt: candidate.updatedAt,
    }
  }
  return drafts
}
export interface StoredReplyConversation {
  id: string
  jobKey: string
  peer: AiReplyConversation['peer']
  messages: AiReplyConversation['messages']
  updatedAt: number
}

const MAX_STORED_CONVERSATIONS = 100
const MAX_STORED_MESSAGES = 50

export function serializeReplyConversations(
  conversations: Iterable<readonly [string, StoredReplyConversation]>,
): Record<string, StoredReplyConversation> {
  const stored: Record<string, StoredReplyConversation> = {}
  for (const [conversationId, conversation] of conversations) {
    if (!conversation.id || !conversation.jobKey || !conversation.peer.uid) continue
    stored[conversationId] = {
      id: conversation.id,
      jobKey: conversation.jobKey,
      peer: conversation.peer,
      messages: conversation.messages.slice(-MAX_STORED_MESSAGES),
      updatedAt: conversation.updatedAt,
    }
  }
  const entries = Object.entries(stored).slice(-MAX_STORED_CONVERSATIONS)
  return Object.fromEntries(entries)
}

function isStoredPeer(value: unknown): value is AiReplyConversation['peer'] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (!('uid' in value) || typeof value.uid !== 'string' || value.uid.length === 0) return false
  return true
}

function isStoredMessage(value: unknown): value is AiReplyConversation['messages'][number] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  if (
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('conversationId' in value) ||
    typeof value.conversationId !== 'string' ||
    !('direction' in value) ||
    (value.direction !== 'incoming' && value.direction !== 'outgoing') ||
    !('text' in value) ||
    typeof value.text !== 'string' ||
    !('timestamp' in value) ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp) ||
    !('sender' in value) ||
    !isStoredPeer(value.sender) ||
    !('recipient' in value) ||
    !isStoredPeer(value.recipient) ||
    !('peer' in value) ||
    !isStoredPeer(value.peer)
  ) {
    return false
  }
  return true
}

export function sanitizeStoredReplyConversations(
  value: unknown,
  now = Date.now(),
): Record<string, StoredReplyConversation> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const conversations: Record<string, StoredReplyConversation> = {}
  for (const [conversationId, valueForConversation] of Object.entries(value)) {
    if (
      valueForConversation === null ||
      typeof valueForConversation !== 'object' ||
      Array.isArray(valueForConversation)
    ) {
      continue
    }
    const candidate = valueForConversation as Partial<StoredReplyConversation>
    if (
      typeof candidate.id !== 'string' ||
      candidate.id !== conversationId ||
      typeof candidate.jobKey !== 'string' ||
      !candidate.jobKey ||
      !isStoredPeer(candidate.peer) ||
      !Array.isArray(candidate.messages) ||
      typeof candidate.updatedAt !== 'number' ||
      !Number.isFinite(candidate.updatedAt) ||
      candidate.updatedAt > now ||
      now - candidate.updatedAt > aiReplyDraftTtlMs
    ) {
      continue
    }
    const messages = candidate.messages.filter(isStoredMessage).slice(-MAX_STORED_MESSAGES)
    if (messages.length === 0) continue
    conversations[conversationId] = {
      id: candidate.id,
      jobKey: candidate.jobKey,
      peer: candidate.peer,
      messages,
      updatedAt: candidate.updatedAt,
    }
  }
  return Object.fromEntries(Object.entries(conversations).slice(-MAX_STORED_CONVERSATIONS))
}
