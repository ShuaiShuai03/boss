export type PromptOptimizationTarget = 'aiFiltering' | 'aiReply'

export interface PromptOptimizationInput {
  target: PromptOptimizationTarget
  currentSystemPrompt: string
  userPreference: string
}

function targetInstruction(target: PromptOptimizationTarget) {
  if (target === 'aiFiltering') {
    return `目标功能：AI 过滤。
- 生成的 system prompt 必须让模型根据岗位信息判断是否值得投递。
- 必须保留 JSON-only 输出约束，输出结构仍是 negative/positive 两组理由和分数。
- 把用户输入的排除岗位、偏好方向、风险条件、加减分偏好转成明确评分规则。
- 不要把用户偏好简单粘贴到最后，要整合到角色、画像、评分规则和输出要求中。
- 不要移除求职者事实，不要编造简历没有的经历。`
  }

  return `目标功能：AI 回复。
- 生成的 system prompt 必须让模型根据岗位信息和 HR 消息生成可直接发送的中文回复。
- 把用户输入的语气、长度、主动程度、禁用表达、联系方式规则转成明确回复要求。
- 保留“只输出可发送回复、不解释、不写标题、不用 Markdown”的约束。
- 不要移除求职者事实，不要编造简历没有的经历。`
}

export function buildPromptOptimizationMessages(input: PromptOptimizationInput) {
  return [
    {
      role: 'system' as const,
      content: `你是 Boss-Helper 的提示词工程助手。你只负责改写某个功能的 system prompt。

输出要求：
- 只输出新的 system prompt 正文。
- 不要解释、不要标题、不要 Markdown、不要代码块。
- 保留原 prompt 中准确的求职者事实和关键安全边界。
- 根据用户个性化要求重写得更清晰、更可执行、更适合稳定批量使用。
- 不要加入无法从当前 prompt 或用户要求中推出的新事实。`,
    },
    {
      role: 'user' as const,
      content: `## 功能约束
${targetInstruction(input.target)}

## 当前 system prompt
${input.currentSystemPrompt.trim()}

## 用户个性化要求
${input.userPreference.trim()}

请输出优化后的 system prompt。`,
    },
  ]
}

export function cleanGeneratedSystemPrompt(text: string) {
  text = text.trim()
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/)
  if (fenced) {
    text = fenced[1].trim()
  }
  return text.replace(/^system\s*[:：]\s*/i, '').trim()
}
