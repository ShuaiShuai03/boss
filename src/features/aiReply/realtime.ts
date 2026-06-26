import { mqtt } from '@/composables/useWebSocket/mqtt'
import type { TechwolfChatProtocol } from '@/composables/useWebSocket/type'
import { AwesomeMessage } from '@/composables/useWebSocket/type'

import { normalizeAiReplyProtocolMessages, type AiReplyNormalizeContext } from './realtimeCore'

export function decodeAiReplySocketPayload(
  bytes: Uint8Array,
  context: AiReplyNormalizeContext = {},
) {
  if (bytes.length === 0) {
    return []
  }

  const packetType = bytes[0] >> 4
  const payload = packetType === 3 ? mqtt.decode(bytes).payload : bytes
  const protocol = AwesomeMessage.decode(payload) as unknown as TechwolfChatProtocol
  return normalizeAiReplyProtocolMessages(protocol, context)
}
