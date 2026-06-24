import { createOpenAI } from '@ai-sdk/openai'
import { LanguageModelV3 } from '@ai-sdk/provider'

import { counter } from '@/message'
import { EXTENSION_CONTEXT_INVALIDATED_MESSAGE, normalizeExtensionContextError } from '@/utils/extension'
import { withTimeout } from '@/utils/promise'

import { desc, getEffectiveAiTimeoutMs, other } from './common'
import {
  getModelEndpointCandidates,
  normalizeOpenaiConfig,
  normalizeOpenaiBaseUrl,
  parseOpenaiModelIds,
  previewBody,
  type ModelEndpointCandidate,
} from './openai-utils'
import type { LLMConf, LLMInfo } from './type'

export interface OpenaiModelDiscoveryResult {
  models: string[]
  sourceUrl: string
  suggestedBaseUrl?: string
  error?: string
}

export type OpenaiLLMConf = LLMConf<
  'openai',
  {
    avatar: string
    base_url: string
    api_key: string
    model: string
    responses?: boolean
    other: other['other']
    advanced: {
      json?: boolean
      stream?: boolean

      temperature?: number
      top_p?: number
      presence_penalty?: number
      frequency_penalty?: number

      tool_choice?: string
      tools?: Array<Record<string, any>>

      extra_headers?: Record<string, string>
      extra_body?: object
    }
  }
>

const info: LLMInfo<OpenaiLLMConf> = {
  mode: {
    mode: 'openai',
    label: 'OpenAI',
  },
  avatar: {
    type: 'input',
    format: 'avatar',
    required: true,
  },
  base_url: {
    desc: '可使用中转/代理API，前提是符合 OpenAI 规范。可填写 Base URL，也可粘贴 /chat/completions 或 /models 完整端点，插件会自动修正。',
    type: 'input',
    format: 'url',
    config: {
      placeholder: 'https://api.openai.com/v1',
    },
    required: true,
  },
  api_key: { type: 'input', required: true },
  model: {
    config: {
      placeholder: '先填写 URL/API Key 自动获取，或手动输入模型名',
      items: [],
      createItem: 'always',
    },
    type: 'input',
    format: 'menu',
    required: true,
  },
  responses: {
    value: false,
    type: 'switch',
    desc: '默认使用ChatCompletions',
  },
  other,
  advanced: {
    label: '高级配置',
    alert: 'warning',
    desc: '小白勿动',
    value: {
      json: {
        value: true,
        type: 'switch',
        desc: '仅支持较新的模型,会强制gpt返回json格式,效果好一点,能有效减少响应解析错误',
        config: {
          disabled: true,
        },
      },
      stream: {
        value: false,
        type: 'switch',
        desc: desc.stream,
        config: {
          disabled: true,
        },
      },
      temperature: {
        type: 'slider',
        config: {
          min: 0,
          max: 2,
          step: 0.05,
        },
        desc: '较高的值（如 0.8）将使输出更加随机，而较低的值（如 0.2）将使其更加集中和确定性。<br/>我们通常建议更改此项或 top_p ，但不要同时更改两者。',
      },
      top_p: {
        type: 'slider',
        config: {
          min: 0,
          max: 1,
          step: 0.05,
        },
        desc: '温度采样的替代方法称为核采样，其中模型考虑具有 top_p 概率质量的标记的结果。因此 0.1 意味着仅考虑包含前 10% 概率质量的标记。<br/>我们通常建议更改此项或 temperature ，但不要同时更改两者。',
      },
      presence_penalty: {
        value: 0,
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据新标记是否出现在文本中来对其进行惩罚，从而增加模型讨论新主题的可能性。',
      },
      frequency_penalty: {
        type: 'slider',
        config: {
          min: -2,
          max: 2,
          step: 0.1,
        },
        desc: '正值根据迄今为止文本中的现有频率对新标记进行惩罚，从而降低模型逐字重复同一行的可能性。',
      },
      tool_choice: {
        type: 'input',
        format: 'menu',
        config: {
          items: ['auto', 'none'],
          createItem: true,
        },
        desc: '工具使用策略, auto表示模型根据输入自动决定是否使用工具, none表示不使用工具',
        condition: 'responses',
      },
      tools: {
        type: 'input',
        format: 'json',
        desc: '暂时仅支持model自带tool, 例如: [{"type": "web_search"}]',
        condition: 'responses',
      },
      extra_headers: {
        type: 'input',
        format: 'json',
        desc: '额外的请求头, 可以用来传一些特殊的认证信息, 例如x-access-token等, 需要填写json格式字符串, 例如{"x-access-token":"xxxx"}',
      },
      extra_body: {
        type: 'input',
        format: 'json',
        desc: '额外的请求体参数, 可以用来传一些特殊的参数, 需要填写json格式字符串, 例如{"key":"value"}',
      },
    },
  },
}

function sanitizeMessage(message: string, apiKey?: string) {
  let result = message
  if (apiKey) {
    result = result.replaceAll(apiKey, '[API_KEY]')
  }
  result = result.replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
  result = result.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
  return result
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) return Object.fromEntries(headers.entries())
  if (Array.isArray(headers)) return Object.fromEntries(headers)
  return headers
}

async function assertBackgroundBridgeReady() {
  try {
    await withTimeout(counter.backgroundTest('success'), 3000, EXTENSION_CONTEXT_INVALIDATED_MESSAGE)
  } catch (error) {
    throw normalizeExtensionContextError(error)
  }
}

async function fetchModels(
  candidate: ModelEndpointCandidate,
  conf: Pick<OpenaiLLMConf, 'api_key' | 'advanced'>,
) {
  await assertBackgroundBridgeReady()
  const res = await counter
    .rawRequest({
      url: candidate.modelsUrl,
      timeout: 30000,
      data: {
        method: 'GET',
        headers: {
          ...(conf.advanced?.extra_headers ?? {}),
          Authorization: `Bearer ${conf.api_key}`,
        },
      },
    })
    .catch((error) => {
      throw normalizeExtensionContextError(error)
    })

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status}: ${res.body}`)
  }

  const models = parseOpenaiModelIds(res.body)
  if (models.length === 0) {
    throw new Error(`响应中未找到模型 ID: ${previewBody(res.body)}`)
  }

  return {
    models,
    sourceUrl: candidate.modelsUrl,
    baseUrl: candidate.baseUrl,
  }
}

export async function discoverOpenaiModels(
  conf: Pick<OpenaiLLMConf, 'base_url' | 'api_key' | 'advanced'>,
): Promise<OpenaiModelDiscoveryResult> {
  const normalizedConf = normalizeOpenaiConfig(conf)
  const baseUrl = normalizeOpenaiBaseUrl(normalizedConf.base_url)
  const candidates = getModelEndpointCandidates(normalizedConf.base_url)
  if (!baseUrl || !normalizedConf.api_key) {
    return {
      models: [],
      sourceUrl: candidates[0]?.modelsUrl ?? '',
      error: '请先填写 Base URL 和 API Key',
    }
  }

  const errors: string[] = []
  for (const candidate of candidates) {
    try {
      const result = await fetchModels(candidate, normalizedConf)
      return {
        models: result.models,
        sourceUrl: result.sourceUrl,
        suggestedBaseUrl: result.baseUrl !== baseUrl ? result.baseUrl : undefined,
      }
    } catch (error) {
      errors.push(
        `${candidate.modelsUrl}: ${sanitizeMessage(
          error instanceof Error ? error.message : String(error),
          normalizedConf.api_key,
        )}`,
      )
    }
  }

  return {
    models: [],
    sourceUrl: candidates[0]?.modelsUrl ?? '',
    error: errors.join('\n'),
  }
}

async function backgroundFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeout: number,
) {
  await assertBackgroundBridgeReady()
  const request = new Request(input, init)
  const body = await request.text()
  const canHaveBody = !['GET', 'HEAD'].includes(request.method.toUpperCase())
  const res = await counter
    .rawRequest({
      url: request.url,
      timeout,
      data: {
        method: request.method,
        headers: normalizeHeaders(request.headers),
        body: canHaveBody ? body : undefined,
      },
    })
    .catch((error) => {
      throw normalizeExtensionContextError(error)
    })

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  })
}

const createModel: (conf: OpenaiLLMConf) => LanguageModelV3 = (conf: OpenaiLLMConf) => {
  const normalizedConf = normalizeOpenaiConfig(conf)
  const timeout = getEffectiveAiTimeoutMs(normalizedConf.other?.timeout)
  const openai = createOpenAI({
    baseURL: normalizeOpenaiBaseUrl(normalizedConf.base_url),
    apiKey: normalizedConf.api_key,
    headers: normalizedConf.advanced.extra_headers,
    fetch: (input, init) => backgroundFetch(input, init, timeout),
  })
  if (normalizedConf.responses) {
    return openai.responses(normalizedConf.model)
  }
  return openai.chat(normalizedConf.model)
}

export const openai = {
  createModel,
  discoverModels: discoverOpenaiModels,
  info,
}
