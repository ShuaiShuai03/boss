import { bossPageGateway } from '@/message/pageGateway'
import { normalizeBossProtocolUserId } from '@/utils/bossIdentity'

import { type BossHelperChatMessageArgs } from './chatBridge'
import { mqtt } from './mqtt'
import type { TechwolfChatProtocol } from './type'
import { AwesomeMessage } from './type'

type MessageArgs = BossHelperChatMessageArgs

let packetMessageId = 0

function nextPacketMessageId() {
  packetMessageId = (packetMessageId % 0xffff) + 1
  return packetMessageId
}

export class Message {
  payload: Uint8Array
  packet: Uint8Array
  hex: string
  args: MessageArgs

  constructor(args: MessageArgs) {
    const formUid = normalizeBossProtocolUserId(args.form_uid)
    const toUid = normalizeBossProtocolUserId(args.to_uid)
    if (!formUid) {
      throw new TypeError('当前用户 ID 无效')
    }
    if (!toUid) {
      throw new TypeError('Boss/HR 用户 ID 无效')
    }
    this.args = { ...args, form_uid: formUid, to_uid: toUid }

    const now = Date.now()
    const mid = now + 68256432452609
    const data: TechwolfChatProtocol = {
      messages: [
        {
          from: {
            uid: formUid,
            source: 0,
          },
          to: {
            uid: toUid,
            name: args.to_name,
            source: args.friend_source ?? 0,
          },
          type: 1,
          mid: mid.toString(),
          time: now.toString(),
          body: {
            type: 1,
            templateId: 1,
            text: args.content,
          },
          cmid: mid.toString(),
        },
      ],
      type: 1,
    }

    this.payload = AwesomeMessage.encode(data).finish().slice()
    this.packet = mqtt.encode({
      messageId: nextPacketMessageId(),
      payload: this.payload,
    })
    this.hex = [...this.packet].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  toArrayBuffer(): ArrayBuffer {
    return this.packet.buffer.slice(
      this.packet.byteOffset,
      this.packet.byteOffset + this.packet.byteLength,
    ) as ArrayBuffer
  }

  toPayloadArrayBuffer(): ArrayBuffer {
    return this.payload.buffer.slice(
      this.payload.byteOffset,
      this.payload.byteOffset + this.payload.byteLength,
    ) as ArrayBuffer
  }

  async send(signal?: AbortSignal) {
    const toast = useToast()
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    }
    try {
      await bossPageGateway.sendChat(this.packet, this.payload)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      toast.add({
        title: normalized.message,
        color: 'error',
      })
      throw normalized
    }
  }
}
