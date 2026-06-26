import { defineContentScript, injectScript } from '#imports'
import { browser } from '#imports'
import {
  AI_REPLY_DOM_COMMAND_EVENT,
  AI_REPLY_DOM_COMMAND_RESULT_EVENT,
  AI_REPLY_DOM_MESSAGE_EVENT,
  AI_REPLY_RUNTIME_SOURCE,
  type AiReplyChatEventPayload,
  type AiReplyCommandResult,
  type AiReplyDomCommand,
  type AiReplyRuntimeMessage,
  isAiReplyRuntimeMessage,
} from '@/features/aiReply/types'
import { ProvideContentAdapter, provideContentCounter } from '@/message/contentScript'

import './boss/inject.css'

function forwardAiReplyChatEvent(event: Event) {
  const payload = (event as CustomEvent<AiReplyChatEventPayload>).detail
  if (!payload?.messages?.length) {
    return
  }

  const message: AiReplyRuntimeMessage = {
    source: AI_REPLY_RUNTIME_SOURCE,
    type: 'chat-event',
    payload,
  }
  void browser.runtime.sendMessage(message).catch((error) => {
    console.warn('转发 AI 回复实时消息失败', error)
  })
}

function sendAiReplyDomCommand(payload: AiReplyRuntimeMessage & { type: 'content-send-draft' }) {
  const requestId = `ai-reply-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      document.removeEventListener(AI_REPLY_DOM_COMMAND_RESULT_EVENT, handleResult)
    }
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<AiReplyCommandResult>).detail
      if (detail?.requestId !== requestId) {
        return
      }
      cleanup()
      resolve({ ok: detail.ok, error: detail.error })
    }
    const timer = window.setTimeout(() => {
      cleanup()
      resolve({ ok: false, error: '发送命令超时，请刷新 Boss 页面后重试' })
    }, 30000)

    document.addEventListener(AI_REPLY_DOM_COMMAND_RESULT_EVENT, handleResult)
    const command: AiReplyDomCommand = {
      requestId,
      type: 'send-draft',
      payload: payload.payload,
    }
    document.dispatchEvent(new CustomEvent(AI_REPLY_DOM_COMMAND_EVENT, { detail: command }))
  })
}

function initAiReplyContentBridge() {
  document.addEventListener(AI_REPLY_DOM_MESSAGE_EVENT, forwardAiReplyChatEvent)

  browser.runtime.onMessage.addListener((message) => {
    if (!isAiReplyRuntimeMessage(message) || message.type !== 'content-send-draft') {
      return
    }
    return sendAiReplyDomCommand(message)
  })
}

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  async main() {
    provideContentCounter(new ProvideContentAdapter())
    initAiReplyContentBridge()
    await injectScript('/boss.js', {
      keepInDom: true,
    })
  },
})
