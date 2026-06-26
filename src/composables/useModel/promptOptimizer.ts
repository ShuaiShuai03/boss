import { Output, ToolLoopAgent } from 'ai'

import { normalizeExtensionContextError } from '@/utils/extension'

import type { ModelConf } from '.'
import { getEffectiveAiTimeoutMs } from './common'
import { openai } from './openai'
import {
  buildPromptOptimizationMessages,
  cleanGeneratedSystemPrompt,
  type PromptOptimizationInput,
} from './promptOptimizer-utils'

export async function generateOptimizedSystemPrompt(
  modelConf: ModelConf,
  input: PromptOptimizationInput,
) {
  if (!modelConf.data) {
    throw new Error(`模型 key ${modelConf.key} 缺少 data 配置`)
  }

  const agent = new ToolLoopAgent({
    model: openai.createModel(modelConf.data),
    output: Output.text(),
    allowSystemInMessages: true,
    temperature: modelConf.data.advanced.temperature,
    topP: modelConf.data.advanced.top_p,
    presencePenalty: modelConf.data.advanced.presence_penalty,
    frequencyPenalty: modelConf.data.advanced.frequency_penalty,
  })

  try {
    const result = await agent.generate({
      timeout: getEffectiveAiTimeoutMs(modelConf.data.other?.timeout),
      messages: buildPromptOptimizationMessages(input),
    })
    const text = cleanGeneratedSystemPrompt(result.text)
    if (!text) {
      throw new Error('模型没有返回可用的 system prompt')
    }
    return text
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const extensionError = normalizeExtensionContextError(e)
    if (extensionError instanceof Error && extensionError !== e) {
      throw extensionError
    }
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('AI 请求超时', { cause: e })
    }
    if (/timeout|timed out|aborted/i.test(message)) {
      throw new Error('AI 请求超时', { cause: e })
    }
    throw e
  }
}
