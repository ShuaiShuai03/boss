import type { FormData, FormInfoData } from '@/types/formData'

// TODO: 移除info, 忘记当初为啥要维护这一坨了, 还是直接写组件里面好看

export const formInfoData: FormInfoData = {
  configLevel: {
    options: [
      {
        value: 'beginner',
        label: '新手',
      },
      {
        value: 'intermediate',
        label: '初学者',
      },
      {
        value: 'advanced',
        label: '中级',
      },
      {
        value: 'expert',
        label: '高级',
      },
    ],
    'data-help': '为不同人群展示不同的配置项, 减少上手难度跟配置过多而产生的恐惧',
  },
  company: {
    label: '公司名',
    'data-help': '公司名排除或包含在集合中，模糊匹配，可用于只投或不投某个公司/子公司。',
  },
  jobTitle: {
    label: '岗位名',
    'data-help': '岗位名排除或包含在集合中，模糊匹配，可用于只投或不投某个岗位名。',
  },
  jobContent: {
    label: '工作内容',
    'data-help':
      "会自动检测上文(不是,不,无需),下文(系统,工具),例子：[外包,上门,销售,驾照], 排除: '外包岗位', 不排除: '不是外包'|'销售系统'",
  },
  hrPosition: {
    label: 'Hr职位',
    'data-help':
      'Hr职位一定包含/排除在集合中，精确匹配, 不在内置中可手动输入,能实现只向经理等进行投递，毕竟人事干的不一定是人事',
  },
  jobAddress: {
    label: '工作地址',
    'data-help': '只能为包含模式, 即投递工作地址当中必须包含当前内容中的任意一项，否则排除',
  },
  salaryRange: {
    label: '薪资范围',
    'data-help': '投递工作的薪资范围, 更多选项可看高级配置',
  },
  companySizeRange: {
    label: '公司规模范围',
    'data-help':
      '投递工作的公司规模, 推荐使用boss自带选项进行筛选。严格宽松定义在薪资高级配置中有写',
  },
  autoApplyEnabled: {
    label: '自动投递',
    'data-help': '开启后点击开始会自动筛选并投递，不再逐条确认。',
  },
  autoGreetingEnabled: {
    label: '自动招呼',
    'data-help': '开启后投递成功会继续发送已启用的自定义招呼语或AI招呼语。',
  },
  dailyLimit: {
    label: '每日投递上限',
    'data-help': '旧版本兼容字段，当前版本不再使用。',
  },
  actionDelayMs: {
    label: '动作间隔(ms)',
    'data-help': '每个岗位处理完成后的等待时间，单位毫秒，用于降低风控风险。',
  },
  maxConsecutiveFailures: {
    label: '连续失败熔断',
    'data-help': '连续错误达到该次数后自动暂停。只统计错误，不统计规则过滤。',
  },
  customGreeting: {
    label: '自定义招呼语',
    'data-help':
      '因为boss不支持将自定义的招呼语设置为默认招呼语。开启表示发送boss默认的招呼语后还会发送自定义招呼语',
  },
  greetingVariable: {
    label: '招呼语变量',
    'data-help': '使用mitem模板引擎来对招呼语进行渲染;',
  },
  activityFilter: {
    label: '活跃度过滤',
    'data-help': '打开后会自动过滤掉最近未活跃的Boss发布的工作。以免浪费每天的100次机会。',
  },
  goldHunterFilter: {
    label: '猎头过滤',
    'data-help':
      'Boss中有一些猎头发布的工作，但是一般而言这种工作不太行，点击可以过滤猎头发布的职位',
  },
  friendStatus: {
    label: '好友过滤(已聊)',
    'data-help': '判断和hr是否建立过聊天，理论上能过滤的同hr，但是不同岗位的工作',
  },
  sameCompanyFilter: {
    label: '相同公司过滤',
    'data-help': '投递过的公司id存储到浏览器本地，避免多次向同公司投递，即使岗位不同hr不同',
  },
  sameHrFilter: {
    label: '相同Hr过滤',
    'data-help': '投递过的hr存储到浏览器本地，避免多次向同hr投递。',
  },
  notification: {
    label: '发送通知',
    'data-help': '可以在网站管理中打开通知权限,当停止时会自动发送桌面端通知提醒。',
  },
  useCache: {
    label: '启用缓存',
    'data-help':
      '开启后会缓存投递记录，避免重复投递，提高效率。但是缓存功能并不积极维护。可能会有bug，或者意外情况，如遇到可尝试清空缓存或者禁用',
  },
  deliveryLimit: {
    label: '每批投递数量',
    'data-help': '每次点击开始/继续会开启一批，成功投递达到该数量后暂停。',
  },
  aiGreeting: {
    label: 'AI招呼语',
    'data-help':
      '即使前面招呼语开了也不会发送，只会发送AI生成的招呼语，让gpt来打招呼真是太棒了，毕竟开场白很重要。',
  },
  aiFiltering: {
    label: 'AI过滤',
    'data-help': '根据工作内容让gpt分析过滤，真是太稳健了，不放过任何一个垃圾',
  },
  aiReply: {
    label: 'AI回复',
    'data-help': '万一消息太多，回不过来了呢，也许能和AiHR聊到地球爆炸？魔法击败魔法',
  },
  record: {
    label: '内容记录',
    'data-help': '拿这些数据去训练个Ai岂不是美滋滋咯？',
  },
  delay: {
    deliveryStarts: {
      label: '投递开始',
      'data-help': '点击投递按钮会等待一段时间,默认值10s',
    },
    deliveryInterval: {
      label: '投递间隔',
      'data-help': '每个投递的间隔,太快易风控,默认值2s',
    },
    deliveryPageNext: {
      label: '投递翻页',
      'data-help': '投递完下一页之后等待的间隔,太快易风控,默认值60s',
    },
    messageSending: {
      label: '消息发送',
      'data-help': '暂未实现 ,在发送消息前允许等待一定的时间让用户来修改或手动发送,默认值5s',
      disable: true,
    },
  },
  amap: {
    enable: {
      label: '启用',
      'data-help': '启用高德地图, 用于获取工作地址的距离和时间进行筛选，需要配置自己的key',
    },
    key: {
      label: '高德地图key',
      'data-help': '高德地图key, 需要自己申请',
    },
    origins: {
      label: '起点经纬度',
      'data-help': '起点经纬度, 经度和纬度用","分隔, 可以输入完整地址点击按钮自动获取',
    },
    straightDistance: {
      label: '直线距离',
      'data-help': '直线距离, 为0禁用，单位: km',
    },
    drivingDistance: {
      label: '驾车距离',
      'data-help':
        '驾车距离, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: km',
    },
    drivingDuration: {
      label: '驾车时间',
      'data-help':
        '驾车时间, 为0禁用，会考虑当前时间的路况，不同时间结果不一样，策略为"速度优先", 单位: 分钟',
    },
    walkingDistance: {
      label: '步行距离',
      'data-help': '步行距离, 为0禁用，单位: km',
    },
    walkingDuration: {
      label: '步行时间',
      'data-help': '步行时间, 为0禁用，单位: 分钟',
    },
  },
}

export const defaultFormData: FormData = {
  configLevel: 'beginner',
  company: {
    include: false,
    value: [],
    options: [],
    enable: false,
  },
  jobTitle: {
    include: true,
    value: [],
    options: [],
    enable: false,
  },
  jobContent: {
    include: false,
    value: [],
    options: [],
    enable: false,
  },
  hrPosition: {
    include: true,
    value: [],
    options: ['经理', '主管', '法人', '人力资源主管', 'hr', '招聘专员'],
    enable: false,
  },
  jobAddress: {
    value: [],
    options: [],
    enable: false,
    include: true,
  },
  salaryRange: {
    value: [8, 13, false],
    advancedValue: {
      // 默认全部关闭，避免用户未配置而投递错误岗位
      H: [0, 1, false],
      D: [0, 1, false],
      M: [0, 1, false],
    },
    enable: false,
  },
  companySizeRange: {
    value: [500, 2000, true],
    enable: false,
  },
  autoApplyEnabled: {
    value: true,
  },
  autoGreetingEnabled: {
    value: true,
  },
  dailyLimit: {
    value: 120,
  },
  actionDelayMs: {
    value: 5000,
  },
  maxConsecutiveFailures: {
    value: 3,
  },
  customGreeting: {
    value: '',
    enable: false,
  },
  deliveryLimit: {
    value: 120,
  },
  greetingVariable: {
    value: false,
  },
  activityFilter: {
    value: true,
  },
  friendStatus: {
    value: true,
  },
  sameCompanyFilter: {
    value: false,
  },
  sameHrFilter: {
    value: true,
  },
  goldHunterFilter: {
    value: false,
  },
  notification: {
    value: true,
  },
  useCache: {
    value: false,
  },
  aiGreeting: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是 [求职者姓名] 的 Boss 直聘开场白助手，需要根据岗位信息生成一条可直接发送给 HR/BOSS 的中文招呼语。

## 使用前请替换的求职者背景
- 姓名或称呼：[求职者姓名]
- 学历与专业：[最高学历/专业背景]
- 当前状态：[所在城市/在职状态/到岗时间]
- 目标方向：[目标岗位方向 1]、[目标岗位方向 2]、[目标岗位方向 3]
- 核心能力：[核心技能 1]、[核心技能 2]、[核心技能 3]、[核心工具或平台]
- 代表项目：
  1. [项目 A]：[用一句话描述职责、技术栈和可量化结果]
  2. [项目 B]：[用一句话描述职责、技术栈和可量化结果]
  3. [项目 C]：[用一句话描述职责、技术栈和可量化结果]
- 工作经历补充：[可选，补充与目标岗位相关的业务、工程、协作或交付经验]

## 生成要求
- 只输出一条招呼语，不要标题、解释、书信格式、项目列表或 Markdown。
- 语气自然、真诚、职业化，像真实求职者主动打招呼；不要夸张营销。
- 长度控制在 50 到 90 个中文字符。
- 必须结合岗位信息选择 1 到 2 个最相关亮点，优先匹配岗位关键词，不要机械堆技能。
- 不要主动输出电话、邮箱、GitHub 链接、薪资要求或隐私信息。
- 如果岗位匹配 [目标岗位方向 1]，优先突出 [相关技能/项目证据]。
- 如果岗位匹配 [目标岗位方向 2]，优先突出 [相关技能/项目证据]。
- 如果岗位匹配 [目标岗位方向 3]，优先突出 [相关技能/项目证据]。
- 如岗位匹配度一般，也要保持礼貌简洁，不要编造未提供的经历。`,
      },
      {
        role: 'user',
        content: `### 待处理的岗位信息:\`\`\`
  <岗位信息>
  岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
  学历要求: {{ jobData.degreeName }}
  技能要求: {{ jobData.skills }}
  岗位标签:{{ jobData.jobLabels }}
    <岗位描述>
    {{ jobData.jobDescription }}
    <岗位描述/>
  </岗位信息>
  \`\`\``,
      },
    ],
  },
  aiFiltering: {
    enable: false,
    prompt: [
      {
        role: 'system',
        content: `## 角色
你是 [求职者姓名] 的岗位匹配评审助手，需要根据求职者背景和岗位信息判断是否值得投递。

最终只返回下面格式的 JSON 字符串，不要有任何其他字符，不要 Markdown。

interface aiFilteringItem {
  reason: string; // 扣分或加分的理由，必须结合岗位文本和求职者背景
  score: number; // 分数变化，正整数，不需要正负号
}

interface aiFiltering {
  negative: aiFilteringItem[]; // 扣分项
  positive: aiFilteringItem[]; // 加分项
}

## 使用前请替换的求职者画像
- 基本信息：[求职者姓名]，[最高学历/专业背景]，[所在城市/到岗状态]。
- 目标岗位：[目标岗位方向 1]、[目标岗位方向 2]、[目标岗位方向 3]。
- 主要能力：[核心技能 1]、[核心技能 2]、[核心技能 3]、[核心工具或平台]。
- 代表经历：[项目 A]、[项目 B]、[项目 C]、[相关工作经历]。
- 当前更适合：[适合的岗位级别/年限范围]、[适合的岗位类型]、[适合的行业或团队类型]。
- 明确排除：[不想投递的岗位类型]、[不可接受的工作模式]、[不可接受的风险因素]。

## 评分规则
- 强匹配加 25 分：岗位明确对应 [目标岗位方向]，且职责与 [核心技能/代表项目] 有直接证据匹配。
- 项目经验匹配加 15 分：岗位需要 [项目 A/B/C] 中已经体现过的技能、工具、业务场景或交付方式。
- 成长友好加 10 分：岗位接受 [适合的岗位级别/年限范围]，或强调学习能力、项目闭环、快速原型、跨团队协作。
- 工作体验加 5 到 10 分：岗位在 [工作制度]、[地点/通勤]、[薪资范围]、[团队/成长空间] 等方面符合个人偏好。
- 重大不匹配扣 25 分：岗位属于 [不想投递的岗位类型]，或核心职责与 [目标岗位方向] 明显无关。
- 能力门槛明显过高扣 15 到 25 分：岗位要求的年限、职级、专业深度或管理责任明显超出求职者现有证据。
- 工作内容偏离扣 10 到 20 分：岗位长期包含 [不可接受的工作内容]，或缺少 [目标能力] 的实际发挥空间。
- 条件风险扣 5 到 15 分：岗位存在 [不可接受的工作模式]、[不可接受的地点/薪资/福利风险] 或描述空泛。
- 不要因为岗位年限略高就自动扣分；如果代表项目能覆盖岗位核心能力，应给匹配加分。
- 不要编造背景中没有的能力；没有证据时不要加分。
- reason 要具体，例如“岗位要求 [岗位关键词]，匹配 [项目或技能证据]”，不要写泛泛的“比较匹配”。`,
      },
      {
        role: 'user',
        content: `## 待处理的岗位信息:
  <岗位信息>
  岗位名:{{ jobData.jobName }}   薪资: {{ jobData.salary }}
  学历要求: {{ jobData.degreeName }}    工作经验要求: {{ jobData.experienceName }}
  福利列表: {{ jobData.welfareList }}
  技能要求: {{ jobData.skills }}
  岗位标签:{{ jobData.jobLabels }}
    <岗位描述>
    {{ jobData.jobDescription }}
    <岗位描述/>
  </岗位信息>`,
      },
    ],
    score: 10,
  },
  aiReply: {
    enable: false,
    prompt: [
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
    ],
  },
  amap: {
    key: '',
    origins: '',
    straightDistance: 0,
    drivingDistance: 0,
    drivingDuration: 0,
    walkingDistance: 0,
    walkingDuration: 0,
    enable: false,
  },
  record: {
    enable: false,
  },
  delay: {
    deliveryStarts: 3,
    deliveryInterval: 5,
    deliveryPageNext: 60,
    messageSending: 5,
  },
  version: '20240401',
}
