import { defineContentScript } from '#imports'
import { decodeAiReplySocketPayload } from '@/features/aiReply/realtime'
import { AI_REPLY_DOM_MESSAGE_EVENT, type AiReplyChatEventPayload } from '@/features/aiReply/types'

function shouldCaptureChatSocket(url: string | URL | undefined) {
  return url != null && url.toString().includes('chatws')
}

function setSharedChatSocket(socket: WebSocket) {
  try {
    window.socket = socket
  } catch {}

  const topWindow = window.top
  if (topWindow != null && topWindow !== window) {
    try {
      topWindow.socket = socket
    } catch {}
  }
}

function clearSharedChatSocket(socket: WebSocket) {
  try {
    if (window.socket === socket) {
      window.socket = undefined
    }
  } catch {}

  const topWindow = window.top
  if (topWindow != null && topWindow !== window) {
    try {
      if (topWindow.socket === socket) {
        topWindow.socket = undefined
      }
    } catch {}
  }
}

function cloneForDom<T>(value: T): T {
  const cloneIntoFn = (globalThis as { cloneInto?: (value: T, target: Window) => T }).cloneInto
  return typeof cloneIntoFn === 'function' ? cloneIntoFn(value, window) : value
}

async function socketDataToBytes(data: unknown): Promise<Uint8Array | null> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  return null
}

function currentUser() {
  const page = window._PAGE
  return {
    uid: String(page?.uid ?? page?.userId ?? page?.encryptUserId ?? ''),
    name: page?.showName ?? page?.name,
    avatar: page?.largeAvatar ?? page?.tinyAvatar,
  }
}

async function emitAiReplyMessages(data: unknown) {
  const bytes = await socketDataToBytes(data)
  if (!bytes) {
    return
  }
  const user = currentUser()
  const messages = decodeAiReplySocketPayload(bytes, { currentUserId: user.uid })
  if (messages.length === 0) {
    return
  }

  const payload: AiReplyChatEventPayload = {
    url: location.href,
    user,
    messages,
  }
  document.dispatchEvent(
    new CustomEvent(AI_REPLY_DOM_MESSAGE_EVENT, {
      detail: cloneForDom(payload),
    }),
  )
}

function hookChatSocket() {
  if (window.__BOSS_HELPER_CHAT_SOCKET_HOOKED__ === true) {
    return
  }
  window.__BOSS_HELPER_CHAT_SOCKET_HOOKED__ = true

  const NativeWebSocket = window.WebSocket
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(target, args, newTarget) as WebSocket
      const [url] = args as [string | URL | undefined, string | string[] | undefined]

      if (!shouldCaptureChatSocket(url)) {
        return socket
      }

      setSharedChatSocket(socket)
      socket.addEventListener('message', (event) => {
        void emitAiReplyMessages(event.data).catch(() => {})
      })
      socket.addEventListener('open', () => {
        setSharedChatSocket(socket)
      })
      socket.addEventListener('close', () => {
        clearSharedChatSocket(socket)
      })

      return socket
    },
  }) as typeof WebSocket
}

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  world: 'MAIN',
  allFrames: true,
  runAt: 'document_start',
  main() {
    hookChatSocket()
  },
})
