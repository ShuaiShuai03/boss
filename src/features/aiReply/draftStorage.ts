export const aiReplyDraftStorageKey = 'boss-helper-ai-reply-drafts'
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
