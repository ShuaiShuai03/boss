// Small, pure helpers extracted from the chat-socket main-world hook so the buffering/rate-limit
// behavior around identity readiness (BH-CHAT-03) and decode failures (BH-CHAT-04) can be unit
// tested without a browser/WebSocket environment.

// A small bounded FIFO used to hold raw socket payloads that arrived before the current user's
// identity was resolvable, instead of silently discarding them (BH-CHAT-03). Oldest entries are
// dropped first once the buffer is full.
export class BoundedBuffer<T> {
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

  drain(): T[] {
    const drained = this.items
    this.items = []
    return drained
  }
}

// Gates how often a repeating failure (e.g. socket decode errors, BH-CHAT-04) is allowed to be
// logged, so a burst of malformed frames can't flood the console while still surfacing that
// something is going wrong (instead of a fully silent catch-and-ignore).
export class RateLimitedLogGate {
  private lastLoggedAt = Number.NEGATIVE_INFINITY
  private readonly intervalMs: number

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs
  }

  shouldLog(now: number): boolean {
    if (now - this.lastLoggedAt < this.intervalMs) {
      return false
    }
    this.lastLoggedAt = now
    return true
  }
}
