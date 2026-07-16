import { defineUnlistedScript } from '#imports'
import { decodeAiReplySocketPayload } from '@/features/aiReply/realtime'
import { BoundedBuffer, RateLimitedLogGate } from '@/features/aiReply/socketCapture'
import { AI_REPLY_DOM_MESSAGE_EVENT, type AiReplyChatEventPayload } from '@/features/aiReply/types'
import { resolveBossUser, waitForBossUser } from '@/utils/bossIdentity'

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
  const user = resolveBossUser(window._PAGE)
  return {
    uid: user.protocolUserId ?? '',
    name: user.name,
    avatar: user.avatar,
  }
}

// `window._PAGE` can populate slightly after the socket hook starts receiving messages. A single
// synchronous read at that moment would permanently misclassify the current user as unknown for
// those early frames (normalizeAiReplyProtocolMessages drops everything without a currentUserId),
// so early messages are buffered here and replayed once identity resolves (BH-CHAT-03).
const pendingBytes = new BoundedBuffer<Uint8Array>(20)
const decodeErrorLogGate = new RateLimitedLogGate(5000)
let decodeErrorCount = 0
let identityUnavailableWarned = false

// Protobuf/MQTT decode failures, an unrelated frame sharing the "chatws" URL substring, or a
// failed Blob read must not be indistinguishable from "no new messages" (BH-CHAT-04). No message
// content is ever logged, only a rate-limited failure count.
function reportCaptureFailure(error: unknown) {
  decodeErrorCount++
  if (decodeErrorLogGate.shouldLog(Date.now())) {
    console.warn(
      `[boss-helper] chat socket capture failed x${decodeErrorCount}`,
      error instanceof Error ? error.message : String(error),
    )
  }
}

function decodeAndEmit(bytes: Uint8Array, user: ReturnType<typeof currentUser>) {
  let messages: ReturnType<typeof decodeAiReplySocketPayload>
  try {
    messages = decodeAiReplySocketPayload(bytes, { currentUserId: user.uid })
  } catch (error) {
    reportCaptureFailure(error)
    return
  }
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

async function emitAiReplyMessages(data: unknown) {
  const bytes = await socketDataToBytes(data)
  if (!bytes) {
    return
  }

  let user = currentUser()
  if (!user.uid) {
    const resolved = await waitForBossUser(() => [window._PAGE], {
      timeoutMs: 5000,
      requireProtocolUserId: true,
    })
    user = {
      uid: resolved.protocolUserId ?? '',
      name: resolved.name,
      avatar: resolved.avatar,
    }
  }

  if (!user.uid) {
    pendingBytes.push(bytes)
    if (!identityUnavailableWarned) {
      identityUnavailableWarned = true
      console.warn('[boss-helper] chat socket: current user identity not ready, buffering message')
    }
    return
  }

  identityUnavailableWarned = false
  for (const buffered of pendingBytes.drain()) {
    decodeAndEmit(buffered, user)
  }
  decodeAndEmit(bytes, user)
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
        void emitAiReplyMessages(event.data).catch(reportCaptureFailure)
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

export default defineUnlistedScript(() => {
  hookChatSocket()
})
