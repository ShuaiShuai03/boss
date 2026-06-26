import { createOpenAI } from '@ai-sdk/openai'
import { Output, ToolLoopAgent, type ModelMessage } from 'ai'

import type { ModelConf } from '@/composables/useModel'
import { getEffectiveAiTimeoutMs } from '@/composables/useModel/common'
import type { OpenaiLLMConf } from '@/composables/useModel/openai'
import { normalizeOpenaiBaseUrl, normalizeOpenaiConfig } from '@/composables/useModel/openai-utils'
import type { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'

import type { AiReplyConversation } from './types'

function renderMessages(model: FormDataAi, data: Record<string, any>): ModelMessage[] {
  const messages =
    typeof model.prompt === 'string'
      ? [{ role: 'user' as const, content: model.prompt }]
      : model.prompt

  return messages.map((message) => ({
    ...message,
    content:
      typeof message.content === 'string' ? renderTemplate(message.content, data) : message.content,
  }))
}

function formatPrompt(messages: ModelMessage[]) {
  return messages
    .map((message) => {
      const content =
        typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
      return `${message.role}:\n${content}`
    })
    .join('\n\n')
}

function createFetch(timeout: number): typeof fetch {
  return async (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeout),
    })
}

function createModel(conf: OpenaiLLMConf) {
  const normalizedConf = normalizeOpenaiConfig(conf)
  const timeout = getEffectiveAiTimeoutMs(normalizedConf.other?.timeout)
  const provider = createOpenAI({
    baseURL: normalizeOpenaiBaseUrl(normalizedConf.base_url),
    apiKey: normalizedConf.api_key,
    headers: normalizedConf.advanced?.extra_headers,
    fetch: createFetch(timeout),
  })

  return {
    model: normalizedConf.responses
      ? provider.responses(normalizedConf.model)
      : provider.chat(normalizedConf.model),
    timeout,
  }
}

function fallbackJob(conversation: AiReplyConversation) {
  const title = conversation.job?.jobName || '未知岗位'
  const company = conversation.job?.brand.name || conversation.peer.company || '未知公司'

  return (
    conversation.job ?? {
      key: `chat-fallback::${conversation.id}`,
      jobName: title,
      positionName: title,
      jobDescription: '',
      experienceName: '',
      degreeName: '',
      salary: '',
      showSkills: [],
      jobLabels: [],
      skills: [],
      boss: {
        name: conversation.peer.name ?? 'Boss/HR',
        title: '',
        avatar: conversation.peer.avatar ?? '',
        certificated: false,
      },
      brand: {
        name: company,
        logo: '',
        scale: '',
        industry: '',
        introduce: '',
        labels: [],
      },
    }
  )
}

function buildReplyContext(conversation: AiReplyConversation) {
  return conversation.messages
    .slice(-8)
    .map((message) => `${message.direction === 'outgoing' ? '我' : 'HR/BOSS'}：${message.text}`)
    .join('\n')
}

export async function generateAiReplyDraft(args: {
  aiReply: FormDataAi
  models: ModelConf[]
  conversation: AiReplyConversation
}) {
  const { aiReply, models, conversation } = args
  if (!aiReply.enable) {
    throw new Error('AI 回复未启用')
  }
  if (!aiReply.model) {
    throw new Error('AI 回复模型未配置')
  }

  const modelConf = models.find((model) => model.key === aiReply.model)
  if (!modelConf?.data) {
    throw new Error(`找不到 AI 回复模型: ${aiReply.model}`)
  }

  const { model, timeout } = createModel(modelConf.data as OpenaiLLMConf)
  const agent = new ToolLoopAgent({
    model,
    output: Output.text(),
    allowSystemInMessages: true,
    temperature: modelConf.data.advanced.temperature,
    topP: modelConf.data.advanced.top_p,
    presencePenalty: modelConf.data.advanced.presence_penalty,
    frequencyPenalty: modelConf.data.advanced.frequency_penalty,
  })
  const data = {
    jobData: fallbackJob(conversation),
    rawData: {},
    state: {
      aiReplyInput: buildReplyContext(conversation),
    },
  }
  const messages = renderMessages(aiReply, data)
  const result = await agent.generate({ timeout, messages })

  return {
    text: result.text.trim(),
    prompt: formatPrompt(messages),
    reasoning: result.reasoningText || null,
  }
}
