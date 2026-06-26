import type { AiReplyPeer, AiReplyRealtimeMessage } from './types'

export interface AiReplyProtocolUser {
  uid?: string | number
  name?: string
  avatar?: string
  company?: string
  source?: number
}

export interface AiReplyProtocolMessage {
  from?: AiReplyProtocolUser
  to?: AiReplyProtocolUser
  mid?: string | number
  cmid?: string | number
  time?: string | number
  body?: {
    text?: string
    jobDesc?: {
      title?: string
      company?: string
      salary?: string
      experience?: string
      education?: string
      city?: string
      bossTitle?: string
      content?: string
      labels?: string[]
    }
  }
  bizId?: string | number
  securityId?: string
}

export interface AiReplyProtocol {
  messages?: AiReplyProtocolMessage[]
}

export interface AiReplyNormalizeContext {
  currentUserId?: string | number
}

function valueToString(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'object') {
    const longLike = value as { low?: unknown; high?: unknown; unsigned?: unknown }
    if (typeof longLike.low === 'number' && typeof longLike.high === 'number') {
      const low = BigInt(longLike.low >>> 0)
      const high = BigInt(longLike.high)
      return ((high << 32n) + low).toString()
    }
  }
  return ''
}

function valueToNumber(value: unknown) {
  const parsed = Number(valueToString(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function peerFromUser(user: AiReplyProtocolUser | undefined): AiReplyPeer {
  return {
    uid: valueToString(user?.uid),
    name: user?.name,
    avatar: user?.avatar,
    company: user?.company,
    source: user?.source,
  }
}

function sameUser(a: string | number | undefined, b: string | number | undefined) {
  if (a == null || b == null) return false
  return valueToString(a) === valueToString(b)
}

export function normalizeAiReplyProtocolMessages(
  protocol: AiReplyProtocol,
  context: AiReplyNormalizeContext = {},
): AiReplyRealtimeMessage[] {
  const currentUserId = context.currentUserId
  const result: AiReplyRealtimeMessage[] = []

  for (const message of protocol.messages ?? []) {
    const text = message.body?.text?.trim() ?? ''
    if (!text) continue

    const sender = peerFromUser(message.from)
    const recipient = peerFromUser(message.to)
    const isSelf = sameUser(sender.uid, currentUserId)
    const peer = isSelf ? recipient : sender
    const peerUid = peer.uid || sender.uid || recipient.uid
    if (!peerUid) continue

    const rawId = valueToString(message.mid ?? message.cmid ?? `${peerUid}:${message.time}:${text}`)
    const conversationId = `boss-chat::${peerUid}::${peer.source ?? 0}`
    const jobDesc = message.body?.jobDesc

    result.push({
      id: rawId,
      conversationId,
      direction: isSelf ? 'outgoing' : 'incoming',
      text,
      timestamp: valueToNumber(message.time) || Date.now(),
      sender,
      recipient,
      peer,
      job:
        jobDesc?.title || jobDesc?.company || jobDesc?.content
          ? {
              key: `chat-job::${message.bizId ?? message.securityId ?? message.mid ?? jobDesc.title}`,
              jobName: jobDesc.title || '未知岗位',
              positionName: jobDesc.title || '未知岗位',
              jobDescription: jobDesc.content ?? '',
              experienceName: jobDesc.experience ?? '',
              degreeName: jobDesc.education ?? '',
              salary: jobDesc.salary ?? '',
              city: jobDesc.city,
              showSkills: [],
              jobLabels: jobDesc.labels ?? [],
              skills: [],
              boss: {
                name: peer.name ?? 'Boss/HR',
                title: jobDesc.bossTitle ?? '',
                avatar: peer.avatar ?? '',
                certificated: false,
              },
              brand: {
                name: jobDesc.company || peer.company || '未知公司',
                logo: '',
                scale: '',
                industry: '',
                introduce: '',
                labels: [],
              },
            }
          : undefined,
    })
  }

  return result
}
