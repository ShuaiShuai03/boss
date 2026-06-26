import { ChatMessageProps } from '@nuxt/ui'
import {
  ChatState,
  ChatStatus,
  ModelMessage,
  Output,
  ToolLoopAgent,
  UIMessage,
  createIdGenerator,
} from 'ai'
import { ShallowReactive } from 'vue'

import { FormDataAi } from '@/types/formData'
import { renderTemplate } from '@/utils/ai'
import { normalizeExtensionContextError } from '@/utils/extension'

import { ModelConf } from '.'
import { WorkflowData } from '../useApplying/type'
import { HelperContext } from '../useHelper'
import { getEffectiveAiTimeoutMs } from './common'
import { openai } from './openai'

const role = [
  'system',
  'user',
  'assistant',
  'boss',
  'jd',
  'filtering',
  'greetings',
  'reply',
] as const
type MessageRole = (typeof role)[number]

export interface Message extends ChatMessageProps {
  uiRole: MessageRole
  messages?: ModelMessage[]
}

export interface ChatModelResult {
  text: string
  prompt: string
  reasoning_content: string | null
}

function renderMessages(model: FormDataAi, data: WorkflowData<any, any>): ModelMessage[] {
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

export class VueChatState<UI_MESSAGE extends UIMessage> implements ChatState<UI_MESSAGE> {
  messagesRef: ShallowRef<UI_MESSAGE[]>
  statusRef = shallowRef<ChatStatus>('ready')
  errorRef = shallowRef<Error | undefined>(undefined)

  constructor(messages?: UI_MESSAGE[]) {
    this.messagesRef = shallowRef(messages ?? [])
  }

  get messages(): UI_MESSAGE[] {
    return this.messagesRef.value
  }

  set messages(messages: UI_MESSAGE[]) {
    this.messagesRef.value = messages
  }

  get status(): ChatStatus {
    return this.statusRef.value
  }

  set status(status: ChatStatus) {
    this.statusRef.value = status
  }

  get error(): Error | undefined {
    return this.errorRef.value
  }

  set error(error: Error | undefined) {
    this.errorRef.value = error
  }

  pushMessage = (message: UI_MESSAGE) => {
    this.messagesRef.value = [...this.messagesRef.value, message]
    triggerRef(this.messagesRef)
  }

  popMessage = () => {
    this.messagesRef.value = this.messagesRef.value.slice(0, -1)
    triggerRef(this.messagesRef)
  }

  replaceMessage = (index: number, message: UI_MESSAGE) => {
    // message is cloned here because vue's deep reactivity shows unexpected behavior, particularly when updating tool invocation parts
    this.messagesRef.value[index] = { ...message }
    triggerRef(this.messagesRef)
  }

  snapshot = <T>(value: T): T => value
}

export class ChatModel {
  states: ShallowReactive<Map<string, VueChatState<Message>>> = shallowReactive(new Map())

  jobs = ref<string[]>([])

  agents: Map<MessageRole, [ToolLoopAgent, ModelConf, FormDataAi]> = new Map()
  generateId: { [key in MessageRole]: () => string }
  lastCreateAgentError = ''

  constructor(public ctx: HelperContext<any, any, any>) {
    this.generateId = role.reduce(
      (acc, agentName) => {
        acc[agentName] = createIdGenerator({
          prefix: agentName,
          size: 16,
        })
        return acc
      },
      {} as { [key in MessageRole]: () => string },
    )
  }

  ensureJobState(data: WorkflowData<any, any>) {
    if (this.jobs.value.findIndex((j) => j === data.jobData.key) === -1) {
      this.jobs.value.unshift(data.jobData.key)
    }

    if (!this.states.has(data.jobData.key)) {
      const state = new VueChatState<Message>()
      state.pushMessage({
        id: this.generateId.jd(),
        uiRole: 'jd',
        role: 'system',
        parts: [
          {
            type: 'text',
            text: `## ${data.jobData.jobName ?? data.jobData.positionName} (${data.jobData.activeTime ? new Date(data.jobData.activeTime).toLocaleDateString() : data.jobData.activeTimeStr})
### 薪资: ${data.jobData.salary ?? '面议'}
### 公司: ${data.jobData.brand.name}
### 地址: ${data.jobData.address ?? data.jobData.city}
### 学历: ${data.jobData.degreeName}

${data.jobData.jobDescription}`,
          },
        ],
        avatar: {
          src: data.jobData.brand.logo ?? data.jobData.boss.avatar,
          alt: data.jobData.brand.name ?? data.jobData.boss.name,
        },
      })
      // @ts-ignore
      this.states.set(data.jobData.key, state)
    }

    const state = this.states.get(data.jobData.key)
    if (!state) {
      throw new Error('消息列表未找到')
    }
    return state
  }

  pushJobMessage(data: WorkflowData<any, any>, message: Message) {
    const state = this.ensureJobState(data)
    if (state.messages.some((item) => item.id === message.id)) {
      return false
    }
    state.pushMessage(message)
    return true
  }

  createAgent(
    model: FormDataAi,
    name: MessageRole,
    opt?: {
      json?: boolean
    },
  ): boolean {
    this.lastCreateAgentError = ''
    const availableKeys = this.ctx.models.modelData.value.map((m) => m.key).filter(Boolean)
    if (!model.model) {
      this.lastCreateAgentError = `模型 key 为空，可用模型 key: ${
        availableKeys.join(', ') || '无'
      }`
      logger.warn('创建 AI Agent 失败', this.lastCreateAgentError)
      return false
    }
    const conf = this.ctx.models.modelData.value.find((m) => m.key === model.model)
    if (!conf) {
      this.lastCreateAgentError = `找不到模型 key: ${model.model}，可用模型 key: ${
        availableKeys.join(', ') || '无'
      }`
      logger.warn('创建 AI Agent 失败', this.lastCreateAgentError)
      return false
    }
    if (!conf.data) {
      this.lastCreateAgentError = `模型 key ${model.model} 缺少 data 配置`
      logger.warn('创建 AI Agent 失败', this.lastCreateAgentError)
      return false
    }

    const agent = new ToolLoopAgent({
      model: openai.createModel(conf.data),
      output: opt?.json ? Output.json() : Output.text(),
      allowSystemInMessages: true,
      temperature: conf.data.advanced.temperature,
      topP: conf.data.advanced.top_p,
      presencePenalty: conf.data.advanced.presence_penalty,
      frequencyPenalty: conf.data.advanced.frequency_penalty,
    })
    this.agents.set(name, [agent, conf, model])
    return true
  }

  async chat(agentName: MessageRole, data: WorkflowData<any, any>): Promise<ChatModelResult> {
    const _agent = this.agents.get(agentName)
    if (!_agent) {
      throw new Error(`Agent ${agentName} not found`)
    }

    const [agent, modelConf, model] = _agent

    const timeout = getEffectiveAiTimeoutMs(modelConf.data?.other?.timeout)
    const messages = renderMessages(model, data)
    const prompt = formatPrompt(messages)
    const state = this.ensureJobState(data)
    // msgs.pushMessage({
    //   id: this.generateId[agentName](),
    //   side: 'right',
    //   avatar: {
    //     src: this.ctx.userInfo.avatar,
    //     alt: this.ctx.userInfo.name,
    //   },
    //   role: 'user',
    //   uiRole: agentName,
    //   parts: [
    //     {
    //       type: 'text',
    //       text: messages
    //         .map((m) => (typeof m.content === 'string' ? m.content : '[复杂消息]'))
    //         .join('\n'),
    //     },
    //   ],

    //   messages,
    // })

    state.status = 'streaming'

    const msg: Message = {
      id: this.generateId[agentName](),
      role: 'assistant',
      uiRole: agentName,
      parts: [],
      side: 'right',
      avatar: {
        src: modelConf.data?.avatar,
        alt: modelConf.data?.model,
      },
      messages,
    }
    state.pushMessage(msg)
    const index = state.messages.findIndex((m) => m.id === msg.id)

    try {
      const result = await agent.generate({ timeout, messages })
      const text = result.text
      const reasoning = result.reasoningText ?? ''
      msg.parts = [
        ...(reasoning
          ? [
              {
                type: 'reasoning' as const,
                text: reasoning,
                state: 'done' as const,
              },
            ]
          : []),
        {
          type: 'text' as const,
          text,
          state: 'done' as const,
        },
      ]
      state.replaceMessage(index, {
        ...msg,
        metadata: {
          usage: result.usage,
          providerMetadata: result.providerMetadata,
        },
      })
      state.status = 'ready'
      logger.debug('Chat finished', result)
      return {
        text,
        prompt,
        reasoning_content: reasoning || null,
      }
    } catch (e) {
      state.status = 'error'
      const message = e instanceof Error ? e.message : String(e)
      const extensionError = normalizeExtensionContextError(e)
      const error =
        extensionError instanceof Error && extensionError !== e
          ? extensionError
          : e instanceof DOMException && e.name === 'TimeoutError'
            ? new Error('AI 请求超时', { cause: e })
            : /timeout|timed out|aborted/i.test(message)
              ? new Error('AI 请求超时', { cause: e })
              : e
      state.error = error as Error
      logger.error('Error during chat generation', e)
      throw error
    }
  }
}
