<script lang="ts" setup>
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart, UIMessage } from 'ai'

import { appearanceConf } from '@/composables/conf'
import type { WorkflowData } from '@/composables/useApplying/type'
import { parseFiltering } from '@/composables/useApplying/utils'
import { useHelper } from '@/composables/useHelper'
import { Message } from '@/composables/useModel/test'
import {
  AI_REPLY_DOM_MESSAGE_EVENT,
  type AiReplyChatEventPayload,
  type AiReplyConversation,
  type AiReplyRealtimeMessage,
} from '@/features/aiReply/types'

const open = defineModel('open', { default: false })
const following = ref(true)
const sendLoading = ref(false)
const chatMessages = useTemplateRef('chatMessages') // TODO: auto scroll

const helper = useHelper()
const toast = useToast()
const selectJob = ref(
  helper.chatModel.jobs.value.length > 0 ? helper.chatModel.jobs.value[0] : null,
)
type DraftStatus = 'idle' | 'generating' | 'ready' | 'error' | 'sent'

interface SidebarConversation extends AiReplyConversation {
  jobKey: string
}

interface DraftState {
  text: string
  status: DraftStatus
  error?: string
  generatedForMessageId?: string
  pendingIncomingId?: string
  dirty: boolean
  updatedAt: number
}

const conversations = reactive(new Map<string, SidebarConversation>())
const conversationIdsByJob = reactive(new Map<string, string>())
const drafts = reactive(new Map<string, DraftState>())

const jobs = computed(() =>
  helper.chatModel.jobs.value.map((key) => ({
    key: key,
    job: helper.jobMaps.get(key),
    // result: helper.jobResultMaps.get(key),
    // messages: helper.chatModel.messages.get(key),
  })),
)

const messages = computed(() => {
  if (!selectJob.value) return
  return helper.chatModel.states.get(selectJob.value)
})

const selectedConversation = computed(() => {
  if (!selectJob.value) return
  const conversationId = conversationIdsByJob.get(selectJob.value)
  return conversationId ? conversations.get(conversationId) : undefined
})

function ensureDraft(conversationId: string) {
  let draft = drafts.get(conversationId)
  if (!draft) {
    draft = {
      text: '',
      status: 'idle',
      dirty: false,
      updatedAt: Date.now(),
    }
    drafts.set(conversationId, draft)
  }
  return draft
}

const selectedDraft = computed(() => {
  const conversation = selectedConversation.value
  return conversation ? ensureDraft(conversation.id) : undefined
})

const draftText = computed({
  get() {
    return selectedDraft.value?.text ?? ''
  },
  set(value: string) {
    const conversation = selectedConversation.value
    if (!conversation) return
    const draft = ensureDraft(conversation.id)
    draft.text = value
    draft.dirty = true
    draft.updatedAt = Date.now()
    if (draft.status === 'idle' || draft.status === 'sent') {
      draft.status = 'ready'
    }
  },
})

const draftLoading = computed(() => selectedDraft.value?.status === 'generating')
const canSendDraft = computed(
  () => !!selectedConversation.value && !!draftText.value.trim() && !draftLoading.value,
)
const draftGenerateLabel = computed(() =>
  selectedDraft.value?.pendingIncomingId || selectedDraft.value?.text ? '重新生成草稿' : '生成回复草稿',
)
const draftPlaceholder = computed(() => {
  if (!selectedConversation.value) {
    return 'AI招呼语发送后，这里会显示后续回复草稿'
  }
  if (selectedDraft.value?.pendingIncomingId) {
    return '已有新消息，点击重新生成草稿'
  }
  return 'AI生成的回复草稿会显示在这里，可编辑后发送'
})
const draftStatusText = computed(() => {
  const draft = selectedDraft.value
  if (!selectedConversation.value) return '未进入回复'
  if (draft?.status === 'generating') return '生成中'
  if (draft?.pendingIncomingId) return '有新消息'
  if (draft?.status === 'ready') return draft.dirty ? '已编辑' : '待发送'
  if (draft?.status === 'sent') return '已发送'
  if (draft?.status === 'error') return '需处理'
  return '待生成'
})

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v) {
      selectJob.value = v
    }
  },
)

function onClient(jobKey: string) {
  selectJob.value = jobKey
  following.value = false
}

function isMessage(message: UIMessage): message is Message {
  logger.debug('Checking message:', message)
  return true
}

function latestIncoming(conversation: SidebarConversation) {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i]
    if (message?.direction === 'incoming') {
      return message
    }
  }
}

function buildReplyContext(conversation: SidebarConversation) {
  return conversation.messages
    .slice(-20)
    .map((message) => `${message.direction === 'outgoing' ? '我' : 'HR/BOSS'}：${message.text}`)
    .join('\n')
}

function reportDraftIssue(message: string, auto: boolean, draft?: DraftState) {
  if (auto && draft) {
    draft.status = 'error'
    draft.error = message
    draft.updatedAt = Date.now()
    return
  }
  toast.add({
    title: message,
    color: 'warning',
  })
}

function ensureWorkflowData(message: AiReplyRealtimeMessage, conversation?: SidebarConversation) {
  if (conversation) {
    const data = helper.jobMaps.get(conversation.jobKey)
    if (data) return data
  }
  if (!message.job) {
    return
  }
  let data = helper.jobMaps.get(message.job.key)
  if (!data) {
    data = {
      jobData: message.job,
      rawData: {} as any,
      state: {},
    } satisfies WorkflowData<any, any>
    helper.jobMaps.set(message.job.key, data)
  }
  return data
}

function pushRealtimeMessage(data: WorkflowData<any, any>, message: AiReplyRealtimeMessage) {
  const outgoing = message.direction === 'outgoing'
  helper.chatModel.pushJobMessage(data, {
    id: `chat:${message.conversationId}:${message.id}`,
    uiRole: 'boss',
    role: outgoing ? 'user' : 'assistant',
    side: outgoing ? 'right' : undefined,
    parts: [
      {
        type: 'text',
        text: message.text,
        state: 'done',
      },
    ],
    avatar: {
      src: outgoing ? helper.userInfo.avatar : message.peer.avatar,
      alt: outgoing ? helper.userInfo.name : message.peer.name,
    },
  })
}

function findConversationByPeer(uid: string) {
  if (!uid) {
    return
  }
  return Array.from(conversations.values()).find((conversation) => conversation.peer.uid === uid)
}

function upsertRealtimeMessage(rawMessage: AiReplyRealtimeMessage) {
  const existing =
    conversations.get(rawMessage.conversationId) || findConversationByPeer(rawMessage.peer.uid)
  const message =
    existing && existing.id !== rawMessage.conversationId
      ? { ...rawMessage, conversationId: existing.id }
      : rawMessage
  const data = ensureWorkflowData(message, existing)
  if (!data) {
    return
  }
  const messageExists = existing?.messages.some((item) => item.id === message.id) ?? false
  if (messageExists) {
    return
  }

  const nextMessages = [...(existing?.messages ?? []), message]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-50)
  const conversation: SidebarConversation = {
    id: message.conversationId,
    jobKey: data.jobData.key,
    peer: message.peer,
    job: existing?.job ?? message.job ?? data.jobData,
    messages: nextMessages,
    updatedAt: Date.now(),
  }

  conversations.set(message.conversationId, conversation)
  conversationIdsByJob.set(data.jobData.key, message.conversationId)
  pushRealtimeMessage(data, message)

  if (following.value) {
    selectJob.value = data.jobData.key
  }
  if (message.direction === 'incoming') {
    maybeAutoGenerateDraft(conversation)
  }
}

function handleAiReplyChatEvent(event: Event) {
  const payload = (event as CustomEvent<AiReplyChatEventPayload>).detail
  if (!payload?.messages?.length) {
    return
  }
  payload.messages.forEach(upsertRealtimeMessage)
}

async function generateReplyDraft(conversation = selectedConversation.value, auto = false) {
  if (!conversation) {
    toast.add({
      title: '请先选择已发送招呼语的会话',
      color: 'warning',
    })
    return
  }
  const draft = ensureDraft(conversation.id)
  const data = helper.jobMaps.get(conversation.jobKey)
  if (!data) {
    reportDraftIssue('未找到岗位上下文', auto, draft)
    return
  }
  if (!helper.conf.formData.aiReply.enable) {
    reportDraftIssue('请先启用后续回复', auto, draft)
    return
  }
  const incoming = latestIncoming(conversation)
  if (!incoming) {
    reportDraftIssue('暂无 HR/BOSS 消息可用于生成回复', auto, draft)
    return
  }
  const context = buildReplyContext(conversation).trim()
  if (!context) {
    reportDraftIssue('聊天上下文为空', auto, draft)
    return
  }
  if (!helper.chatModel.createAgent(helper.conf.formData.aiReply, 'reply')) {
    reportDraftIssue(helper.chatModel.lastCreateAgentError || 'AI回复模型未配置', auto, draft)
    return
  }

  draft.status = 'generating'
  draft.error = undefined
  draft.updatedAt = Date.now()
  try {
    data.state.aiReplyInput = context
    const result = await helper.chatModel.chat('reply', data)
    data.state.aiReplyQ = result.prompt
    data.state.aiReplyR = result.reasoning_content
    data.state.aiReplyA = result.text.trim()
    const pendingIncomingId = draft.pendingIncomingId
    draft.text = data.state.aiReplyA
    draft.status = 'ready'
    draft.dirty = false
    draft.generatedForMessageId = incoming.id
    draft.pendingIncomingId =
      pendingIncomingId && pendingIncomingId !== incoming.id ? pendingIncomingId : undefined
    draft.updatedAt = Date.now()
    if (!data.state.aiReplyA) {
      toast.add({
        title: 'AI回复为空',
        color: 'warning',
      })
    }
  } catch (err: any) {
    logger.error(err)
    draft.status = 'error'
    draft.error = err?.message ?? `${err}`
    draft.updatedAt = Date.now()
    if (!auto) {
      toast.add({
        title: draft.error,
        color: 'error',
      })
    }
  } finally {
    if (
      draft.pendingIncomingId &&
      !draft.dirty &&
      draft.pendingIncomingId !== draft.generatedForMessageId
    ) {
      maybeAutoGenerateDraft(conversations.get(conversation.id) ?? conversation)
    }
  }
}

function maybeAutoGenerateDraft(conversation: SidebarConversation) {
  if (!helper.conf.formData.aiReply.enable) {
    return
  }
  const incoming = latestIncoming(conversation)
  if (!incoming) {
    return
  }
  const draft = ensureDraft(conversation.id)
  if (draft.status === 'generating') {
    draft.pendingIncomingId = incoming.id
    draft.updatedAt = Date.now()
    return
  }
  if (draft.generatedForMessageId === incoming.id) {
    return
  }
  if (draft.dirty && draft.text.trim()) {
    draft.pendingIncomingId = incoming.id
    draft.updatedAt = Date.now()
    return
  }
  void generateReplyDraft(conversation, true)
}

async function sendDraft() {
  const conversation = selectedConversation.value
  if (!conversation) {
    toast.add({
      title: '请先选择会话',
      color: 'warning',
    })
    return
  }
  const data = helper.jobMaps.get(conversation.jobKey)
  const draft = ensureDraft(conversation.id)
  const text = draft.text.trim()
  if (!data || !text) {
    toast.add({
      title: '回复内容为空',
      color: 'warning',
    })
    return
  }
  if (!conversation.peer.uid) {
    toast.add({
      title: '缺少 Boss/HR 用户 ID',
      color: 'error',
    })
    return
  }

  sendLoading.value = true
  try {
    await helper.sendChatMessage({
      conversationId: conversation.id,
      text,
      toUid: conversation.peer.uid,
      toName: conversation.peer.name,
      friendSource: conversation.peer.source,
    })
    const message: AiReplyRealtimeMessage = {
      id: `draft:${Date.now()}`,
      conversationId: conversation.id,
      direction: 'outgoing',
      text,
      timestamp: Date.now(),
      sender: {
        uid: helper.userInfo.id,
        name: helper.userInfo.name,
        avatar: helper.userInfo.avatar,
      },
      recipient: conversation.peer,
      peer: conversation.peer,
      job: data.jobData,
    }
    upsertRealtimeMessage(message)
    draft.text = ''
    draft.status = 'sent'
    draft.dirty = false
    draft.error = undefined
    draft.pendingIncomingId = undefined
    draft.updatedAt = Date.now()
  } catch (err: any) {
    logger.error(err)
    toast.add({
      title: err?.message ?? `${err}`,
      color: 'error',
    })
  } finally {
    sendLoading.value = false
  }
}

const activeDots = ref<Set<number>>(new Set())
let patternIndex = 0
let stepIndex = 0

const size = 4
const gap = 2
const totalDots = size * size

const patterns = [
  [[0], [1], [2], [3], [7], [11], [15], [14], [13], [12], [8], [4], [5], [6], [10], [9]],
  [
    [0, 4, 8, 12],
    [1, 5, 9, 13],
    [2, 6, 10, 14],
    [3, 7, 11, 15],
  ],
  [
    [5, 6, 9, 10],
    [1, 4, 7, 8, 11, 14],
    [0, 3, 12, 15],
    [1, 4, 7, 8, 11, 14],
    [5, 6, 9, 10],
  ],
  [[0], [1, 4], [2, 5, 8], [3, 6, 9, 12], [7, 10, 13], [11, 14], [15]],
]

function nextStep() {
  const pattern = patterns[patternIndex]
  if (!pattern) return

  activeDots.value = new Set(pattern[stepIndex])
  stepIndex++

  if (stepIndex >= pattern.length) {
    stepIndex = 0
    patternIndex = (patternIndex + 1) % patterns.length
  }
}

const statusMessages = ['Searching...', 'Reading...', 'Analyzing...', 'Thinking...']
const currentIndex = ref(0)
const displayedText = ref(statusMessages[0]!)
const chars = 'abcdefghijklmnopqrstuvwxyz'

function scramble(from: string, to: string) {
  const maxLength = Math.max(from.length, to.length)
  let frame = 0
  const totalFrames = 15

  const step = () => {
    frame++
    let result = ''
    const progress = (frame / totalFrames) * maxLength

    for (let i = 0; i < maxLength; i++) {
      if (i < progress - 2) {
        result += to[i] || ''
      } else if (i < progress) {
        result += chars[Math.floor(Math.random() * chars.length)]
      } else {
        result += from[i] || ''
      }
    }

    displayedText.value = result

    if (frame < totalFrames) {
      requestAnimationFrame(step)
    } else {
      displayedText.value = to
    }
  }

  requestAnimationFrame(step)
}

let matrixInterval: ReturnType<typeof setInterval> | undefined
let textInterval: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  document.addEventListener(AI_REPLY_DOM_MESSAGE_EVENT, handleAiReplyChatEvent)
  nextStep()
  matrixInterval = setInterval(nextStep, 120)
  textInterval = setInterval(() => {
    const prev = displayedText.value
    currentIndex.value = (currentIndex.value + 1) % statusMessages.length
    scramble(prev, statusMessages[currentIndex.value]!)
  }, 3000)
})

onUnmounted(() => {
  document.removeEventListener(AI_REPLY_DOM_MESSAGE_EVENT, handleAiReplyChatEvent)
  clearInterval(matrixInterval)
  clearInterval(textInterval)
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :side="appearanceConf.leftChat ? 'left' : 'right'"
    inset
    :dismissible="false"
    :modal="false"
    :ui="{ body: 'flex flex-col overscroll-contain p-2', content: 'top-14' }"
    :style="{
      width: `${appearanceConf.chatBoxWidth}px`,
    }"
  >
    <template #header>
      <div class="flex flex-row overflow-x-auto gap-1 flex-1">
        <UButton
          v-for="job in jobs"
          :avatar="{
            src: job.job?.jobData.brand.logo ?? job.job?.jobData.boss.avatar,
            loading: 'lazy',
          }"
          size="md"
          :color="selectJob === job.key ? 'primary' : 'neutral'"
          variant="outline"
          @click="onClient(job.key)"
          :title="job.job?.jobData?.jobName || job.job?.jobData?.positionName || job.key"
        >
          {{ job.job?.jobData.boss.name || job.job?.jobData.positionName || job.key }}
        </UButton>
      </div>

      <UFieldGroup>
        <UButton
          size="md"
          :color="following ? 'primary' : 'neutral'"
          variant="ghost"
          @click="following = !following"
          icon="i-lucide-accessibility"
          title="自动跟随"
        >
        </UButton>
        <UButton
          size="md"
          color="neutral"
          variant="ghost"
          @click="open = false"
          icon="i-lucide-x"
          title="关闭"
        >
        </UButton>
      </UFieldGroup>
    </template>
    <template #body>
      <UChatMessages
        v-if="selectJob && messages"
        :key="selectJob"
        ref="chatMessages"
        :messages="messages.messagesRef.value"
        :user="{ variant: 'subtle', ui: { container: 'max-w-[85%] gap-1.5' } }"
        :assistant="{ variant: 'subtle', ui: { container: 'gap-1.5' } }"
        should-auto-scroll
        should-scroll-to-bottom
        :status="messages.statusRef.value"
        :ui="{
          indicator: 'bg-red-300',
        }"
      >
        <template #content="{ message }">
          <template v-if="isMessage(message)">
            <template
              v-for="(part, index) in message.parts"
              :key="`${message.id}-${part.type}-${index}`"
            >
              <UChatReasoning
                v-if="isReasoningUIPart(part)"
                :text="part.text"
                :streaming="isPartStreaming(part)"
              >
                <p class="whitespace-pre-wrap">
                  {{ part.text }}
                </p>
              </UChatReasoning>
              <UChatTool
                v-else-if="isToolUIPart(part)"
                :text="getToolName(part)"
                :streaming="isToolStreaming(part)"
              />

              <p v-else-if="isTextUIPart(part)" class="whitespace-pre-wrap">
                {{
                  message.uiRole === 'filtering' && part.state === 'done'
                    ? parseFiltering(part.text).message
                    : part.text
                }}
              </p>
            </template>
          </template>
        </template>
        <template #indicator>
          <div class="indicator flex items-center gap-2 text-muted overflow-hidden">
            <div
              class="shrink-0 grid size-4"
              :style="{
                gridTemplateColumns: `repeat(${size}, 1fr)`,
                gap: `${gap}px`,
              }"
            >
              <span
                v-for="i in totalDots"
                :key="i"
                class="rounded-sm bg-current transition-opacity duration-100"
                :class="activeDots.has(i - 1) ? 'opacity-100' : 'opacity-20'"
              />
            </div>

            <UChatShimmer :text="displayedText" class="text-sm font-mono" />
          </div>
        </template>
      </UChatMessages>
    </template>
    <template #footer>
      <div class="flex w-full flex-col gap-2">
        <UAlert
          v-if="selectedDraft?.pendingIncomingId"
          color="warning"
          variant="subtle"
          title="已有新消息"
          description="当前草稿保留了你的编辑，点击重新生成可使用最新上下文。"
        />
        <UAlert
          v-if="selectedDraft?.status === 'error' && selectedDraft.error"
          color="error"
          variant="subtle"
          title="生成失败"
          :description="selectedDraft.error"
        />
        <UTextarea
          v-model="draftText"
          :rows="3"
          :maxrows="5"
          autoresize
          :placeholder="draftPlaceholder"
          :disabled="draftLoading || !selectedConversation"
        />
        <div class="flex items-center justify-between gap-2">
          <UBadge variant="subtle" color="neutral">
            {{ draftStatusText }}
          </UBadge>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-sparkles"
              :loading="draftLoading || messages?.statusRef.value === 'streaming'"
              :disabled="!selectedConversation || draftLoading"
              @click="generateReplyDraft()"
            >
              {{ draftGenerateLabel }}
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-send"
              :loading="sendLoading"
              :disabled="!canSendDraft || sendLoading"
              @click="sendDraft"
            >
              发送
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
/* article.group\/message[data-role="assistant"] > indicator{
.container{
  [data-slot="container"]{

  }
}
} */
</style>
