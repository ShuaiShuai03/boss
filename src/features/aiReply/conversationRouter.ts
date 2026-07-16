// Routing logic for incoming realtime chat messages, kept separate from ChatBox.vue so the
// merge-safety rules (BH-CHAT-01/02) can be unit tested without mounting the component.

export interface ConversationLookupInput {
  conversationId: string
  peerUid: string
}

export interface ConversationLike {
  id: string
  peer: { uid: string }
}

// Finds the conversation an incoming message belongs to. An exact conversationId match always
// wins. Otherwise, falling back to "the peer's conversation" is only safe when the peer has
// exactly one open conversation: with two or more (e.g. the same HR messaging about different
// jobs), guessing which one an unscoped message belongs to risks silently attaching it to the
// wrong job's context, so we report "no match" instead and let the caller buffer it.
export function pickConversationForMessage<C extends ConversationLike>(
  conversations: ReadonlyMap<string, C>,
  message: ConversationLookupInput,
): C | undefined {
  const exact = conversations.get(message.conversationId)
  if (exact) return exact
  if (!message.peerUid) return undefined

  let onlyMatch: C | undefined
  for (const conversation of conversations.values()) {
    if (conversation.peer.uid !== message.peerUid) continue
    if (onlyMatch) return undefined
    onlyMatch = conversation
  }
  return onlyMatch
}

// A small bounded FIFO queue for messages that could not be routed yet (e.g. no job metadata and
// no unambiguous existing conversation). Bounded so a burst of unroutable messages can't grow
// memory unboundedly; oldest entries are dropped first.
export class PendingMessageQueue<T> {
  private items: T[] = []
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  push(item: T) {
    if (this.items.length >= this.maxSize) {
      this.items.shift()
    }
    this.items.push(item)
  }

  get size() {
    return this.items.length
  }

  // Attempts to route every buffered item via `attempt`; items that still fail stay queued in
  // their original relative order.
  retry(attempt: (item: T) => boolean) {
    const remaining: T[] = []
    for (const item of this.items) {
      if (!attempt(item)) {
        remaining.push(item)
      }
    }
    this.items = remaining
  }
}
