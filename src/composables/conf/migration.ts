import type { FormData } from '../../types/formData'

function jsonClone<T>(source: T): T {
  return JSON.parse(JSON.stringify(source)) as T
}

function parseLegacyRange(value: string, label: string): [number, number, boolean] {
  const values = value.split('-').map(Number)
  if (values.length !== 2 || values.some((item) => !Number.isFinite(item) || item < 0)) {
    throw new Error(`${label}不是有效范围`)
  }
  return [values[0]!, values[1]!, false]
}

const LEGACY_AI_REPLY_PROMPT = [
  {
    role: 'system',
    content: `你是 [求职者姓名] 的 Boss 直聘聊天助手。根据岗位信息和 HR 消息生成一条自然、礼貌、简洁、可直接发送的中文回复。

使用前请替换的求职者背景：
- 姓名或称呼：[求职者姓名]
- 学历与专业：[最高学历/专业背景]
- 当前状态：[所在城市/在职状态/到岗时间]
- 目标方向：[目标岗位方向 1]、[目标岗位方向 2]、[目标岗位方向 3]
- 关键能力：[核心技能 1]、[核心技能 2]、[核心技能 3]、[核心工具或平台]
- 代表项目：[项目 A]、[项目 B]、[项目 C]
- 工作经历：[与目标岗位相关的工作经历或可迁移能力]

回复要求：
- 只输出可以直接发送给 HR/BOSS 的回复，不要解释、不要标题、不要 Markdown。
- 默认 1 到 3 句，语气真诚、稳重、不过度自夸。
- 根据 HR 的问题回答：问自我介绍就突出最相关项目；问到岗时间就依据 [在职状态/到岗时间] 回答；问匹配度就结合岗位关键词说明 1 到 2 个证据；问是否考虑地点/薪资/面试就按 [地点/薪资/面试偏好] 礼貌表达。
- 不要主动输出电话、邮箱、GitHub 链接，除非 HR 明确要求联系方式或作品链接。
- 不要编造未提供的学历、公司、薪资、年限、获奖、论文或实习经历。
- 如果 HR 消息信息不足，给出礼貌承接并主动索要岗位重点或面试安排。`,
  },
  {
    role: 'user',
    content: `## 岗位信息
岗位名: {{ jobData.jobName }}
公司: {{ jobData.brand.name }}
薪资: {{ jobData.salary }}
学历要求: {{ jobData.degreeName }}
岗位描述:
{{ jobData.jobDescription }}

## HR消息或上下文
{{ state.aiReplyInput }}`,
  },
]

function isLegacyAiReplyPrompt(prompt: unknown) {
  return JSON.stringify(prompt) === JSON.stringify(LEGACY_AI_REPLY_PROMPT)
}

const migrations: Array<[
  version: string,
  migrate: (from: Partial<FormData>, defaults: FormData) => Partial<FormData>,
]> = [
  [
    '20250826',
    (from) => {
      const salaryRangeValue: unknown = from.salaryRange?.value
      if (from.salaryRange && typeof salaryRangeValue === 'string') {
        from.salaryRange.value = parseLegacyRange(salaryRangeValue, '历史薪资范围')
      }
      const companySizeRangeValue: unknown = from.companySizeRange?.value
      if (from.companySizeRange && typeof companySizeRangeValue === 'string') {
        from.companySizeRange.value = parseLegacyRange(
          companySizeRangeValue,
          '历史公司规模范围',
        )
      }
      return from
    },
  ],
  [
    '20260521',
    (from, defaultFormData) => {
      if (from.aiFiltering?.prompt) {
        if (typeof from.aiFiltering.prompt === 'string') {
          from.aiFiltering.prompt = [{ role: 'user', content: from.aiFiltering.prompt }]
        }
      } else {
        from.aiFiltering = {
          ...defaultFormData.aiFiltering,
          ...from.aiFiltering,
          prompt: jsonClone(defaultFormData.aiFiltering.prompt),
        }
      }
      if (from.aiGreeting?.prompt) {
        if (typeof from.aiGreeting.prompt === 'string') {
          from.aiGreeting.prompt = [{ role: 'user', content: from.aiGreeting.prompt }]
        }
      } else {
        from.aiGreeting = {
          ...defaultFormData.aiGreeting,
          ...from.aiGreeting,
          prompt: jsonClone(defaultFormData.aiGreeting.prompt),
        }
      }
      if (from.jobAddress) {
        from.jobAddress = {
          ...from.jobAddress,
          include: true,
        }
      }
      return from
    },
  ],
]

export function migrateFormData(source: Partial<FormData>, defaultFormData: FormData) {
  let migrated = jsonClone(source)
  for (const [version, migrate] of migrations) {
    if ((migrated.version ?? '20240401') >= version) continue
    migrated = migrate(migrated, defaultFormData)
    migrated.version = version
  }

  if (!migrated.aiReply?.prompt || isLegacyAiReplyPrompt(migrated.aiReply.prompt)) {
    migrated.aiReply = {
      ...defaultFormData.aiReply,
      ...migrated.aiReply,
      prompt: jsonClone(defaultFormData.aiReply.prompt),
    }
  }
  const legacyDeliveryInterval = migrated.delay?.deliveryInterval
  if (
    migrated.actionDelayMs?.value == null &&
    typeof legacyDeliveryInterval === 'number' &&
    Number.isFinite(legacyDeliveryInterval) &&
    legacyDeliveryInterval >= 0
  ) {
    migrated.actionDelayMs = { value: legacyDeliveryInterval * 1000 }
  }
  migrated.dailyLimit ??= {
    value: migrated.deliveryLimit?.value ?? defaultFormData.dailyLimit.value,
  }
  migrated.autoApplyEnabled ??= jsonClone(defaultFormData.autoApplyEnabled)
  migrated.autoGreetingEnabled ??= jsonClone(defaultFormData.autoGreetingEnabled)
  migrated.actionDelayMs ??= jsonClone(defaultFormData.actionDelayMs)
  migrated.maxConsecutiveFailures ??= jsonClone(defaultFormData.maxConsecutiveFailures)
  return migrated
}
