<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'

import { browser } from '#imports'
import { loadAiReplyConfig } from '@/features/aiReply/config'
import { generateAiReplyDraft } from '@/features/aiReply/generate'
import {
  AI_REPLY_RUNTIME_SOURCE,
  type AiReplyConversation,
  type AiReplyDraft,
  type AiReplyRuntimeMessage,
  type AiReplySnapshot,
  isAiReplyRuntimeMessage,
} from '@/features/aiReply/types'

const toast = useToast()
const snapshot = ref<AiReplySnapshot>({ conversations: [], updatedAt: 0 })
const selectedId = ref('')
const config = shallowRef<Awaited<ReturnType<typeof loadAiReplyConfig>> | null>(null)
const configError = ref('')
const snapshotError = ref('')
const drafts = reactive(new Map<string, AiReplyDraft>())
const autoDraftTimers = new Map<string, number>()
const sendingId = ref<string | null>(null)

const conversations = computed(() => snapshot.value.conversations)
const selectedConversation = computed(() => {
  return (
    conversations.value.find((conversation) => conversation.id === selectedId.value) ??
    conversations.value[0] ??
    null
  )
})
const selectedDraft = computed(() => {
  const conversation = selectedConversation.value
  return conversation ? ensureDraft(conversation.id) : null
})
const aiReplyReady = computed(() => {
  const data = config.value
  if (!data?.formData.aiReply.enable || !data.formData.aiReply.model) {
    return false
  }
  return data.models.some((model) => model.key === data.formData.aiReply.model && model.data)
})

function createDraft(): AiReplyDraft {
  return {
    status: 'idle',
    text: '',
    editableText: '',
    updatedAt: Date.now(),
  }
}

function ensureDraft(conversationId: string) {
  let draft = drafts.get(conversationId)
  if (!draft) {
    draft = createDraft()
    drafts.set(conversationId, draft)
  }
  return draft
}

function latestIncoming(conversation: AiReplyConversation) {
  return conversation.messages
    .slice()
    .reverse()
    .find((message) => message.direction === 'incoming')
}

function scheduleAutoDraft(conversation: AiReplyConversation) {
  if (!config.value || !aiReplyReady.value) {
    return
  }
  const incoming = latestIncoming(conversation)
  if (!incoming) {
    return
  }
  const draft = ensureDraft(conversation.id)
  if (draft.status === 'generating' || draft.generatedForMessageId === incoming.id) {
    return
  }

  const existingTimer = autoDraftTimers.get(conversation.id)
  if (existingTimer) {
    window.clearTimeout(existingTimer)
  }
  const timer = window.setTimeout(() => {
    autoDraftTimers.delete(conversation.id)
    void generateDraft(conversation, incoming.id)
  }, 800)
  autoDraftTimers.set(conversation.id, timer)
}

function scheduleAutoDrafts(items: AiReplyConversation[]) {
  items.forEach(scheduleAutoDraft)
}

async function loadConfig() {
  configError.value = ''
  try {
    config.value = await loadAiReplyConfig()
    scheduleAutoDrafts(conversations.value)
  } catch (error) {
    configError.value = error instanceof Error ? error.message : String(error)
  }
}

async function refreshSnapshot() {
  snapshotError.value = ''
  const message: AiReplyRuntimeMessage = {
    source: AI_REPLY_RUNTIME_SOURCE,
    type: 'get-snapshot',
  }
  try {
    const response = (await browser.runtime.sendMessage(message)) as
      | { ok: boolean; snapshot?: AiReplySnapshot; error?: string }
      | undefined
    if (!response?.ok || !response.snapshot) {
      throw new Error(response?.error ?? '无法读取实时会话快照')
    }
    snapshot.value = response.snapshot
  } catch (error) {
    snapshotError.value = error instanceof Error ? error.message : String(error)
  }
}

async function generateDraft(conversation: AiReplyConversation, messageId?: string) {
  const data = config.value
  const draft = ensureDraft(conversation.id)
  if (!data) {
    draft.status = 'error'
    draft.error = 'AI 回复配置未加载'
    draft.updatedAt = Date.now()
    return
  }

  drafts.set(conversation.id, {
    ...draft,
    status: 'generating',
    error: undefined,
    generatedForMessageId: messageId ?? latestIncoming(conversation)?.id,
    updatedAt: Date.now(),
  })

  try {
    const result = await generateAiReplyDraft({
      aiReply: data.formData.aiReply,
      models: data.models,
      conversation,
    })
    if (!result.text) {
      throw new Error('AI 回复为空')
    }
    drafts.set(conversation.id, {
      status: 'ready',
      text: result.text,
      editableText: result.text,
      prompt: result.prompt,
      reasoning: result.reasoning,
      generatedForMessageId: messageId ?? latestIncoming(conversation)?.id,
      updatedAt: Date.now(),
    })
  } catch (error) {
    drafts.set(conversation.id, {
      ...ensureDraft(conversation.id),
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
  } finally {
    const currentConversation = conversations.value.find((item) => item.id === conversation.id)
    const currentIncoming = currentConversation ? latestIncoming(currentConversation) : null
    if (currentConversation && currentIncoming && currentIncoming.id !== messageId) {
      scheduleAutoDraft(currentConversation)
    }
  }
}

async function sendDraft() {
  const conversation = selectedConversation.value
  const draft = selectedDraft.value
  if (!conversation || !draft) {
    return
  }
  const text = draft.editableText.trim()
  if (!text) {
    toast.add({ title: '回复内容为空', color: 'warning' })
    return
  }

  sendingId.value = conversation.id
  const message: AiReplyRuntimeMessage = {
    source: AI_REPLY_RUNTIME_SOURCE,
    type: 'send-draft',
    payload: {
      conversationId: conversation.id,
      text,
    },
  }
  try {
    const response = (await browser.runtime.sendMessage(message)) as
      | { ok: boolean; error?: string }
      | undefined
    if (!response?.ok) {
      throw new Error(response?.error ?? '发送失败')
    }
    drafts.set(conversation.id, {
      ...draft,
      status: 'sent',
      editableText: text,
      text,
      updatedAt: Date.now(),
    })
    toast.add({ title: '回复已发送', color: 'success' })
  } catch (error) {
    drafts.set(conversation.id, {
      ...draft,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
    toast.add({
      title: error instanceof Error ? error.message : String(error),
      color: 'error',
    })
  } finally {
    sendingId.value = null
  }
}

async function copyDraft() {
  const text = selectedDraft.value?.editableText.trim()
  if (!text) {
    return
  }
  await navigator.clipboard.writeText(text)
  toast.add({ title: '已复制草稿', color: 'success' })
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusText(draft: AiReplyDraft | null) {
  if (!draft) return '未选择'
  if (draft.status === 'generating') return '生成中'
  if (draft.status === 'ready') return '待确认'
  if (draft.status === 'sent') return '已发送'
  if (draft.status === 'error') return '需处理'
  return '未生成'
}

function statusColor(draft: AiReplyDraft | null) {
  if (draft?.status === 'ready') return 'success'
  if (draft?.status === 'generating') return 'warning'
  if (draft?.status === 'error') return 'error'
  if (draft?.status === 'sent') return 'neutral'
  return 'neutral'
}

function handleRuntimeMessage(message: unknown) {
  if (!isAiReplyRuntimeMessage(message) || message.type !== 'snapshot') {
    return
  }
  snapshot.value = message.payload
}

watch(
  conversations,
  (items) => {
    if (!selectedId.value && items[0]) {
      selectedId.value = items[0].id
    }
    scheduleAutoDrafts(items)
  },
  { immediate: true },
)

onMounted(async () => {
  browser.runtime.onMessage.addListener(handleRuntimeMessage)
  await loadConfig()
  await refreshSnapshot()
})

onUnmounted(() => {
  browser.runtime.onMessage.removeListener(handleRuntimeMessage)
  autoDraftTimers.forEach((timer) => window.clearTimeout(timer))
  autoDraftTimers.clear()
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <div class="min-h-screen bg-default text-default flex flex-col">
      <header class="border-b border-default px-4 py-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold">AI 回复</h1>
          <p class="text-sm text-muted truncate">实时捕获 Boss/HR 新消息，生成可编辑回复草稿</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :color="aiReplyReady ? 'success' : 'warning'" variant="subtle">
            {{ aiReplyReady ? 'AI 已就绪' : '需配置 AI 回复' }}
          </UBadge>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-rotate-cw"
            label="刷新"
            @click="refreshSnapshot"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-settings"
            label="重载配置"
            @click="loadConfig"
          />
        </div>
      </header>

      <div v-if="configError || snapshotError" class="px-4 pt-4 space-y-2">
        <UAlert
          v-if="configError"
          color="error"
          icon="i-lucide-triangle-alert"
          title="配置加载失败"
          :description="configError"
        />
        <UAlert
          v-if="snapshotError"
          color="warning"
          icon="i-lucide-wifi-off"
          title="实时会话不可用"
          :description="snapshotError"
        />
      </div>

      <UAlert
        v-if="!aiReplyReady"
        class="m-4 mb-0"
        color="warning"
        icon="i-lucide-sparkles"
        title="AI 回复未准备好"
        description="请先在 Boss 页面插件面板中启用 AI 回复，并选择可用模型。页面仍会继续接收实时消息。"
      />

      <main class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_420px]">
        <aside class="min-h-0 border-r border-default flex flex-col">
          <div class="px-4 py-3 border-b border-default flex items-center justify-between">
            <h2 class="text-sm font-medium">实时会话</h2>
            <UBadge color="neutral" variant="subtle">{{ conversations.length }}</UBadge>
          </div>
          <div v-if="conversations.length === 0" class="p-6 text-sm text-muted">
            打开 Boss 页面并保持登录后，新收到的 Boss/HR 文本消息会出现在这里。
          </div>
          <div v-else class="min-h-0 overflow-y-auto">
            <button
              v-for="conversation in conversations"
              :key="conversation.id"
              class="w-full border-b border-default px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              :class="selectedConversation?.id === conversation.id ? 'bg-muted/60' : ''"
              @click="selectedId = conversation.id"
            >
              <div class="flex items-center gap-3">
                <UAvatar :src="conversation.peer.avatar" :alt="conversation.peer.name" size="sm" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-sm font-medium">
                      {{ conversation.peer.name || conversation.job?.boss.name || 'Boss/HR' }}
                    </span>
                    <span class="text-xs text-muted">
                      {{ formatTime(conversation.updatedAt) }}
                    </span>
                  </div>
                  <p class="truncate text-xs text-muted">
                    {{ conversation.job?.jobName || conversation.job?.brand.name || '实时聊天' }}
                  </p>
                </div>
              </div>
              <p class="mt-2 line-clamp-2 text-sm text-muted">
                {{ conversation.messages[conversation.messages.length - 1]?.text }}
              </p>
            </button>
          </div>
        </aside>

        <section class="min-h-0 border-r border-default flex flex-col">
          <div class="px-4 py-3 border-b border-default">
            <h2 class="text-sm font-medium">
              {{ selectedConversation?.job?.jobName || '消息流' }}
            </h2>
            <p class="text-xs text-muted">
              {{
                selectedConversation?.job?.brand.name ||
                selectedConversation?.tabUrl ||
                '等待实时消息'
              }}
            </p>
          </div>

          <div v-if="!selectedConversation" class="flex flex-1 items-center justify-center p-8">
            <div class="text-center text-sm text-muted">
              <UIcon name="i-lucide-message-square-text" class="mx-auto mb-3 size-8" />
              暂无实时消息
            </div>
          </div>

          <div v-else class="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div
              v-for="message in selectedConversation.messages"
              :key="message.id"
              class="flex"
              :class="message.direction === 'outgoing' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[78%] rounded-md border border-default px-3 py-2 text-sm leading-relaxed"
                :class="
                  message.direction === 'outgoing'
                    ? 'bg-primary/10 text-default'
                    : 'bg-muted/40 text-default'
                "
              >
                <div class="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span>{{
                    message.direction === 'outgoing' ? '我' : message.sender.name || 'HR/BOSS'
                  }}</span>
                  <span>{{ formatTime(message.timestamp) }}</span>
                </div>
                <p class="whitespace-pre-wrap break-words">{{ message.text }}</p>
              </div>
            </div>
          </div>
        </section>

        <aside class="min-h-0 flex flex-col">
          <div class="px-4 py-3 border-b border-default flex items-center justify-between">
            <div>
              <h2 class="text-sm font-medium">回复草稿</h2>
              <p class="text-xs text-muted">人工确认后发送</p>
            </div>
            <UBadge :color="statusColor(selectedDraft)" variant="subtle">
              {{ statusText(selectedDraft) }}
            </UBadge>
          </div>

          <div
            v-if="selectedConversation && selectedDraft"
            class="min-h-0 flex-1 overflow-y-auto p-4 space-y-4"
          >
            <UAlert
              v-if="selectedDraft.error"
              color="error"
              icon="i-lucide-triangle-alert"
              title="草稿生成失败"
              :description="selectedDraft.error"
            />
            <UTextarea
              v-model="selectedDraft.editableText"
              :rows="10"
              :maxrows="18"
              autoresize
              placeholder="AI 生成的回复草稿会出现在这里"
              :disabled="
                selectedDraft.status === 'generating' || sendingId === selectedConversation.id
              "
            />
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-copy"
                label="复制"
                :disabled="!selectedDraft.editableText.trim()"
                @click="copyDraft"
              />
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-sparkles"
                label="重新生成"
                :loading="selectedDraft.status === 'generating'"
                :disabled="!aiReplyReady"
                @click="generateDraft(selectedConversation)"
              />
              <UButton
                color="primary"
                icon="i-lucide-send"
                label="发送"
                :loading="sendingId === selectedConversation.id"
                :disabled="
                  !selectedDraft.editableText.trim() || selectedDraft.status === 'generating'
                "
                @click="sendDraft"
              />
            </div>

            <UCollapsible v-if="selectedDraft.prompt || selectedDraft.reasoning">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-file-text"
                label="查看 AI 输入"
              />
              <template #content>
                <div class="mt-2 space-y-3 text-xs">
                  <pre
                    v-if="selectedDraft.reasoning"
                    class="whitespace-pre-wrap rounded-md bg-muted/40 p-3"
                    >{{ selectedDraft.reasoning }}</pre
                  >
                  <pre
                    v-if="selectedDraft.prompt"
                    class="whitespace-pre-wrap rounded-md bg-muted/40 p-3"
                    >{{ selectedDraft.prompt }}</pre
                  >
                </div>
              </template>
            </UCollapsible>
          </div>

          <div v-else class="flex flex-1 items-center justify-center p-8 text-sm text-muted">
            选择一个实时会话后生成回复草稿
          </div>
        </aside>
      </main>
    </div>
  </UApp>
</template>
