import { Adapter, SendMessage, OnMessage, Message } from 'comctx'

const INJECTOR_EVENT = 'boss-helper:injector-message'
const PROVIDER_EVENT = 'boss-helper:provider-message'

function getBridgeDocument() {
  return globalThis.document
}

function cloneMessage(message: Message) {
  /**
   * Compatible with Firefox
   * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
   */
  const doc = getBridgeDocument()
  // @ts-ignore
  return typeof cloneInto === 'function' ? cloneInto(message, doc?.defaultView) : message
}

function createBridgeEvent(eventName: string, detail: Message) {
  const EventCtor = getBridgeDocument()?.defaultView?.CustomEvent ?? CustomEvent
  return new EventCtor(eventName, { detail })
}

abstract class CustomEventAdapter implements Adapter {
  protected abstract incomingEvents: string[]
  protected abstract outgoingEvents: string[]

  sendMessage: SendMessage = (message) => {
    const doc = getBridgeDocument()
    if (!doc) return
    const detail = cloneMessage(message)
    this.outgoingEvents.forEach((eventName) => {
      doc.dispatchEvent(createBridgeEvent(eventName, detail))
    })
  }

  onMessage: OnMessage = (callback) => {
    const doc = getBridgeDocument()
    if (!doc) return
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    this.incomingEvents.forEach((eventName) => {
      doc.addEventListener(eventName, handler)
    })
    return () => {
      const currentDoc = getBridgeDocument()
      if (!currentDoc) return
      this.incomingEvents.forEach((eventName) => {
        currentDoc.removeEventListener(eventName, handler)
      })
    }
  }
}

export class ProvideContentAdapter extends CustomEventAdapter {
  protected incomingEvents = [INJECTOR_EVENT, 'message']
  protected outgoingEvents = [PROVIDER_EVENT, 'message']
}

export class InjectContentAdapter extends CustomEventAdapter {
  protected incomingEvents = [PROVIDER_EVENT]
  protected outgoingEvents = [INJECTOR_EVENT]
}

export class LegacyContentAdapter implements Adapter {
  sendMessage: SendMessage = (message) => {
    const doc = getBridgeDocument()
    if (!doc) return
    /**
     * Compatible with Firefox
     * https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts#cloneinto
     */
    doc.dispatchEvent(createBridgeEvent('message', cloneMessage(message)))
  }

  onMessage: OnMessage = (callback) => {
    const doc = getBridgeDocument()
    if (!doc) return
    const handler = (event: Event) => {
      callback((event as CustomEvent<Partial<Message> | undefined>).detail)
    }
    doc.addEventListener('message', handler)
    return () => getBridgeDocument()?.removeEventListener('message', handler)
  }
}
