import type { Adapter, Message, OnMessage, SendMessage } from 'comctx'

export interface ContentBridgeOptions {
  channelId: string
  token: string
}

interface BridgeEnvelope {
  token: string
  message: Partial<Message> | undefined
}

function createRandomId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }
  return Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('')
}

export function createContentBridgeOptions(): ContentBridgeOptions {
  return {
    channelId: createRandomId(),
    token: createRandomId(),
  }
}

export function readInjectedContentBridgeOptions(): ContentBridgeOptions {
  let script = document.currentScript as HTMLScriptElement | null
  if (!script) {
    for (let index = document.scripts.length - 1; index >= 0; index--) {
      const candidate = document.scripts.item(index)
      if (
        candidate?.dataset.bossHelperBridgeId &&
        candidate.dataset.bossHelperBridgeToken &&
        new URL(candidate.src).pathname.endsWith('/boss.js')
      ) {
        script = candidate
        break
      }
    }
  }
  const channelId = script?.dataset.bossHelperBridgeId
  const token = script?.dataset.bossHelperBridgeToken
  script?.removeAttribute('data-boss-helper-bridge-id')
  script?.removeAttribute('data-boss-helper-bridge-token')

  if (!channelId || !token) {
    throw new Error('BossHelper content bridge is not initialized')
  }

  return { channelId, token }
}

function getBridgeDocument() {
  return globalThis.document
}

function cloneEnvelope(envelope: BridgeEnvelope) {
  const doc = getBridgeDocument()
  // @ts-ignore Firefox extension page-script compatibility.
  return typeof cloneInto === 'function' ? cloneInto(envelope, doc?.defaultView) : envelope
}

function createBridgeEvent(eventName: string, detail: BridgeEnvelope) {
  const EventCtor = getBridgeDocument()?.defaultView?.CustomEvent ?? CustomEvent
  return new EventCtor(eventName, { detail: cloneEnvelope(detail) })
}

function createEventNames(channelId: string) {
  const prefix = `boss-helper:content:${channelId}`
  return {
    injector: `${prefix}:injector`,
    provider: `${prefix}:provider`,
  }
}

abstract class CustomEventAdapter implements Adapter {
  protected abstract incomingEvent: string
  protected abstract outgoingEvent: string

  constructor(protected bridge: ContentBridgeOptions) {}

  sendMessage: SendMessage = (message) => {
    const doc = getBridgeDocument()
    if (!doc) return
    doc.dispatchEvent(
      createBridgeEvent(this.outgoingEvent, {
        token: this.bridge.token,
        message,
      }),
    )
  }

  onMessage: OnMessage = (callback) => {
    const doc = getBridgeDocument()
    if (!doc) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<BridgeEnvelope | undefined>).detail
      if (detail?.token !== this.bridge.token) return
      callback(detail.message)
    }
    doc.addEventListener(this.incomingEvent, handler)
    return () => getBridgeDocument()?.removeEventListener(this.incomingEvent, handler)
  }
}

export class ProvideContentAdapter extends CustomEventAdapter {
  protected incomingEvent: string
  protected outgoingEvent: string

  constructor(bridge: ContentBridgeOptions) {
    super(bridge)
    const events = createEventNames(bridge.channelId)
    this.incomingEvent = events.injector
    this.outgoingEvent = events.provider
  }
}

export class InjectContentAdapter extends CustomEventAdapter {
  protected incomingEvent: string
  protected outgoingEvent: string

  constructor(bridge: ContentBridgeOptions) {
    super(bridge)
    const events = createEventNames(bridge.channelId)
    this.incomingEvent = events.provider
    this.outgoingEvent = events.injector
  }
}
