# BossHelper Chrome UI/UX 全面审查

> 审查日期：2026-07-14（北京时间）
> 审查对象：当前工作树与 `.output/chrome-mv3`
> 审查模式：只读分析；未修改产品代码
> 范围说明：用户在审查过程中明确将范围收窄为 Chrome。Edge、Firefox 不再作为完成条件；共享 UI 是否一致按用户判断处理。

## 0. 审查方法与证据边界

本报告综合了主代理检查和 6 个只读专项审查：视觉设计、用户流程、无障碍、构建一致性、前端架构/性能、UX 测试保障。协作接口不能指定子代理模型，因此未能按原始要求固定使用 `gpt-5.3-codex-spark`；所有子代理使用运行环境实际分配的模型。

证据标签：

- **[R] 运行证据**：真实 Chromium 进程加载 `.output/chrome-mv3`，在 BOSS 职位页交互或读取 DOM/Accessibility 状态。
- **[B] 构建证据**：构建命令、manifest、文件大小、哈希或产物内容。
- **[S] 源码证据**：当前工作树中的明确调用链、模板或样式。
- **[U] 待验证**：尚缺运行或用户研究证据，不作为确定缺陷。

Chrome 运行检查使用隔离的 Playwright Chromium 1223 profile，不读取个人浏览器 cookie/localStorage，也未触发开始投递、保存、发送消息等有业务副作用的操作。品牌版 Google Chrome 当前忽略命令行 `--load-extension`，因此未用个人 Chrome profile 绕过限制。已确认的范围是 Chrome MV3 产物在 Chromium 内核中的真实加载与交互；品牌版 Chrome 扩展管理页手工加载仍列在人工验收项。

运行证据：

| ID  | 证据                                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `.output/chrome-mv3` 成功注册 `background.js` service worker，并在 BOSS 职位页创建 1 个 `boss-helper-job` Shadow DOM host。                                                                                                                                                         |
| R2  | Chrome options 页运行时 `title="Options Title"`、`lang="en"`、`bodyChildCount=0`、`bodyText=""`。[截图](C:/Users/SHUAI/.codex/visualizations/2026/07/14/019f5f2d-6738-7eb3-b5fe-539d7dfbd354/chromium-options-verified.png)                                                         |
| R3  | 主页面 `clientWidth=1022`、`scrollWidth=1224`，形成 202px 页面级横向溢出；主 host 宽 1224px。[主界面截图](C:/Users/SHUAI/.codex/visualizations/2026/07/14/019f5f2d-6738-7eb3-b5fe-539d7dfbd354/chromium-zhipin-login.png)                                                           |
| R4  | 键盘 Tab 进入扩展后依次到版本按钮、当前 tab、对话、反馈、帮助、tabpanel、关闭、开始，再进入岗位标题链接；岗位卡片详情切换 `div` 从未进入焦点序列。                                                                                                                                  |
| R5  | 展开“筛选配置”后，DOM 实测存在重复 ID `v-12`、`v-13`、`v-14`；每个 ID 同时用于 checkbox 与 input，控件均无独立 `aria-label`。                                                                                                                                                       |
| R6  | 用标准 WCAG 相对亮度公式复算白字/状态背景：error 3.82:1、warn 2.19:1、success 2.10:1、running 1.25:1、request 3.15:1，仅 ai 4.67:1 达到普通文本 4.5:1。[配置页截图](C:/Users/SHUAI/.codex/visualizations/2026/07/14/019f5f2d-6738-7eb3-b5fe-539d7dfbd354/chromium-config-click.png) |

## 1. Executive summary

当前 Chrome 扩展已经具备较完整的业务功能、清晰的主标签结构和较好的错误 toast/AI 草稿反馈，但 UI 成熟度仍属于“功能可用、交付门禁与关键状态模型未收口”。最需要优先解决的不是视觉润色，而是 4 个可能影响真实操作结果的 P1：初始化失败仍可开始投递、预设切换可能覆盖数据、统计存在多个相互独立的状态源、SPA 重挂不卸载 Vue。

高频体验的主要瓶颈是：用户从浏览器标准入口进入空白 options；主面板固定 1136px 导致分屏/缩放横向滚动；配置保存规则在不同模块之间不一致；停止原因只出现在日志/通知而未进入主控制区；帮助和岗位详情仍依赖鼠标。

最值得优先实施的 5 项改动：

1. 为配置/模型初始化建立 `loading → ready | error` 门禁，`start()` fail closed。
2. 把预设选择接到现有 `switchPreset()`，并为切换/保存补回归测试。
3. 将统计收敛为单一 store，先 hydrate 再允许工作流写入。
4. 删除空白 options 入口或实现一个轻量、有效的启动页；不要复制完整主面板进 popup。
5. 修复主容器响应式宽度和表单 accessible-name/重复 ID，作为后续 UI 改动的共同基础。

没有发现 P0 阻断问题；确认 12 项 P1、10 项 P2 和 3 项 P3。P1 数量较多的原因是扩展会执行自动投递与消息相关操作，错误状态和可访问性缺陷的后果高于普通内容网站。

## 2. Repository and UI map

### 2.1 代码与构建

| 项目          | 当前实现                                                           |
| ------------- | ------------------------------------------------------------------ |
| 源码根目录    | `src/`                                                             |
| Chrome 产物   | `.output/chrome-mv3`                                               |
| Manifest      | MV3；`background.service_worker=background.js`                     |
| 构建框架      | WXT 0.20.27 + Vite 7.3.6                                           |
| UI 框架       | Vue 3.5、Nuxt UI 4.9、Tailwind CSS 4                               |
| 状态          | Vue refs/computed、composables、extension storage/message bridge   |
| 主 UI bundle  | `.output/chrome-mv3/boss.js`，1,843,302 B raw，约 526,748 B gzip-9 |
| Chrome 总产物 | 约 2,031,499 B                                                     |

### 2.2 界面入口

| 入口                           | 实现位置                                                                | 状态                                            |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------- |
| BOSS 页面主面板                | `src/App.vue`，由 `src/entrypoints/boss/main.ts` 注入 `boss-helper-job` | 核心入口；真实加载通过                          |
| 统计                           | `src/components/Tabs/Statistics.vue`                                    | 默认 tab                                        |
| 筛选                           | `src/components/Tabs/Filter.vue`                                        | 主 tab                                          |
| 配置/外观                      | `src/components/Tabs/Config.vue`、`Appearance.vue`                      | 主 tab + accordion                              |
| AI/模型/提示词                 | `src/components/Tabs/AI.vue`、`src/components/AI/**`                    | 主 tab + modal                                  |
| 日志                           | `src/components/Tabs/Logs.vue`                                          | 主 tab                                          |
| 关于/赞赏                      | `src/components/Tabs/About.vue`                                         | 主 tab                                          |
| 岗位卡片带                     | `src/components/JobCards.vue`、`JobCard.vue`                            | 主面板下方                                      |
| 对话侧栏                       | `src/components/ChatBox.vue`                                            | 始终挂载，按钮开关                              |
| 悬浮菜单/首次协议              | `src/AppMenu.vue`                                                       | 注入代码在 `main.ts:348-351` 被注释，当前不可达 |
| Options                        | `src/entrypoints/options/index.html`                                    | manifest 暴露，但运行时为空白                   |
| Popup/action                   | 无                                                                      | 不存在                                          |
| Side panel/onboarding/commands | 无                                                                      | 不存在                                          |

共用 UI 没有 Chrome 专属分支；Chrome 只通过 WXT manifest 和浏览器 API 适配运行。

### 2.3 仓库命令与说明

- 文档：`README.md`、`PRIVACY.md`；未发现独立设计规范或组件交互规范。
- 构建：`npm run build:chrome`。
- 类型：`npm run check`。
- lint：`npm run lint`。
- 测试：`npm test`，由 4 个 Node 验证脚本组成。
- 未发现组件测试、E2E、视觉回归或 Playwright/Vitest 配置。

## 3. Core user journeys

| 核心流程       | 当前步骤                                                                                   | 摩擦点                                                      | 建议流程                                                   | 预计收益                          |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------- |
| 安装后首次使用 | 安装 → 点击扩展图标无有效 action → 从详情进入空白 options → 用户自行知道要访问 BOSS 职位页 | 标准入口是死路，首用说明不可达                              | 轻量启动页 → “打开/聚焦 BOSS 职位页” → 3 步首用清单        | 从无明确路径变为 1 次明确点击     |
| 首次配置并投递 | BOSS 页 → 配置 → 展开区块 → 启用/填写 → 底部保存 → 统计 → 开始                             | 保存入口远；初始化未完成也可开始；配置和启动割裂            | ready 门禁 → 推荐/自定义关键项 → 固定保存栏 → “保存并开始” | 减少 2–3 次导航，并消除初始化竞态 |
| 切换配置预设   | 选择新预设 → 页面仍显示旧值 → 保存                                                         | 当前选择只改名称，保存可能把旧内容写入新预设                | 选择 → `switchPreset()` 加载 → 明确 loading/失败回滚       | 避免预设覆盖与误投                |
| 日常修改配置   | 核心配置手动保存；外观自动保存；AI 开关立即保存；模型内外两次“保存”                        | 用户需记忆多套持久化语义                                    | 统一自动保存，或统一 dirty 状态 + 固定提交栏               | 每轮少 1 次保存，降低丢失风险     |
| 配置 AI 模型   | AI → 模型 → 新建/测试 → 内层保存 → 外层保存                                                | 两次同名保存；删除/复制先报成功但尚未持久化                 | 编辑器“应用”后原子持久化，成功反馈只在 storage 成功后出现  | 少 1 次保存和 1 次 modal 判断     |
| 投递停止后恢复 | toast/通知 → 主控只显示“继续” → 切日志找原因 → 回来处理                                    | 批次满、连续失败、无更多岗位、异常暂停同一表现              | 主控区持久显示原因 + 情境动作                              | 每次恢复少 2–3 次切换             |
| 浏览岗位卡片   | 横向滚动 → 悬停卡片 → 点击内容切换详情                                                     | 卡片重叠、邻卡移动；详情不可键盘操作                        | 无重叠列表/grid；原生展开按钮                              | 更快比较岗位，键盘可完成同一任务  |
| AI 回复        | 对话 → 选会话 → 生成/编辑 → 发送                                                           | 生成失败/新消息反馈较完整；关闭时仍有后台动画，草稿刷新丢失 | 保持内联反馈；仅流式时启动动画；session 草稿               | 降低后台消耗与草稿丢失            |

## 4. Prioritized findings

### P0

未发现 P0。

### P1-01 配置未就绪或加载失败时仍可启动自动投递

| 字段      | 内容                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 统计 → 开始；Chrome                                                                                                                                                                                                 |
| 类型      | 交互、状态管理、正确性                                                                                                                                                                                              |
| 用户影响  | storage 较慢或读取失败时，用户点击“开始”可能按宽松默认值执行，而不是按已保存配置执行。                                                                                                                              |
| 复现      | 给 storageGet 注入延迟/拒绝；打开页面后立即点击开始。当前按钮没有 readiness gate。                                                                                                                                  |
| 证据      | [S] `src/App.vue:116-120` 在 mounted 后异步初始化；`Statistics.vue:135-141` 只根据 workflow running 显示 loading；`conf/index.ts:246-270` 失败后仍结束 loading；`boss/main.ts:255-275` 直接读取当前内存配置并开始。 |
| 根因      | 初始化只是一项 UI 副作用，没有成为 `start()` 的前置不变量。                                                                                                                                                         |
| 推荐改动  | 建立 `loading/ready/error` 状态；ready 前禁用按钮；`start()` 内再次 `await ensureInitialized()`；读取失败时 fail closed。                                                                                           |
| 范围/成本 | `App.vue`、`Statistics.vue`、conf/model 初始化、`main.ts`；S–M                                                                                                                                                      |
| 预期收益  | 消除最危险的“默认配置误投”竞态。                                                                                                                                                                                    |
| 验证      | 延迟/拒绝 storage fixture；确认 ready 前无请求，失败时只显示恢复动作。                                                                                                                                              |

### P1-02 预设切换未加载目标数据，保存会覆盖目标预设

| 字段      | 内容                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 配置 → 预设；Chrome                                                                                                                                                                                              |
| 类型      | 交互、正确性、数据安全                                                                                                                                                                                           |
| 用户影响  | 从 A 选择 B 后仍显示 A 的字段；点击保存会把 A 内容写到 B key，造成配置覆盖。                                                                                                                                     |
| 复现      | 创建两个不同预设；A → 选择 B → 不改字段直接保存 → 重载 B。                                                                                                                                                       |
| 证据      | [S] `Config.vue:561-571` 直接 `v-model="conf.formDataPreset.value"`，只监听 create；正确的 `switchPreset()` 已存在于 `conf/index.ts:438-453`，但全仓无调用；`confSaving()` 按当前 key 写当前表单（`:274-288`）。 |
| 根因      | “选择的名称”和“加载该名称的数据”被拆成两个未连接动作。                                                                                                                                                           |
| 推荐改动  | 改为 `:model-value` + `@update:model-value="conf.switchPreset"`；切换中禁用表单/保存，失败回滚旧选择。                                                                                                           |
| 范围/成本 | `Config.vue` + 预设测试；S                                                                                                                                                                                       |
| 预期收益  | 防止预设数据损坏和错误配置投递。                                                                                                                                                                                 |
| 验证      | A/B 独立 fixture；切换立即更新字段，保存/重载后两者仍独立。                                                                                                                                                      |

### P1-03 统计存在三个独立状态源，UI可能不实时且可能覆盖当日数据

| 字段      | 内容                                                                                                                                                                                                             |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 统计、动态标题、投递工作流；Chrome                                                                                                                                                                               |
| 类型      | 状态管理、正确性                                                                                                                                                                                                 |
| 用户影响  | 统计面板可能不随本批变化；动态标题长期为旧值；首次工作流写入可能用从 0 开始的数据覆盖 storage 中已有当天数据。                                                                                                   |
| 复现      | 预置当天 success/total，加载后处理一条；比较面板、标题、`local:web-geek-job-Today`。                                                                                                                             |
| 证据      | [S] `useStatistics.ts:13-49` 每次调用创建新 refs 和写 storage watcher；分别在 `useHelper/ctx.ts:43-47`、`Statistics.vue:9-15`、`Appearance.vue:7-10` 调用。工作流写 helper 实例，统计面板只 hydrate 自己的实例。 |
| 根因      | 将带持久化 watcher 的 composable 误当作 singleton store。                                                                                                                                                        |
| 推荐改动  | 只创建一个统计 store，由 HelperContext 注入；工作流启动前 hydrate；所有 UI 引用同一实例；串行/合并持久化。                                                                                                       |
| 范围/成本 | `useStatistics.ts`、HelperContext、Statistics/Appearance；M                                                                                                                                                      |
| 预期收益  | 统计、标题、持久化保持单一事实源。                                                                                                                                                                               |
| 验证      | 旧值 +1、实时 UI、单 watcher、刷新后值一致。                                                                                                                                                                     |

### P1-04 自定义元素断开时不卸载 Vue，SPA 导航会累积监听器与定时器

| 字段      | 内容                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | BOSS 站内路由与扩展重挂；Chrome                                                                                                                                                                                              |
| 类型      | 架构、性能、稳定性                                                                                                                                                                                                           |
| 用户影响  | 路由替换 host 后旧 Vue tree 仍存活；重复 AI 消息监听、动画 interval、网络配置 timer 和 watcher 可造成重复处理与资源增长。                                                                                                    |
| 复现      | jobs/recommend 路由往返 10 次；观察 host、document listener、timer 与 heap。                                                                                                                                                 |
| 证据      | [S] `src/index.ts:12-45` createApp/mount 后不保存 app，无 `disconnectedCallback`；`ChatBox.vue:527-541` 只在 `onUnmounted` 清理；`useHelper/ctx.ts:96-117` 5 分钟 timer 无 dispose；`main.ts:372-382` watch 无 stop handle。 |
| 根因      | Web Component 生命周期没有桥接 Vue app/context teardown。                                                                                                                                                                    |
| 推荐改动  | 元素实例保存 app；`disconnectedCallback` 调 `app.unmount()`；HelperContext 增加 `dispose()` 清理 timer/watch/router hook。                                                                                                   |
| 范围/成本 | `src/index.ts`、HelperContext、路由挂载；M                                                                                                                                                                                   |
| 预期收益  | 避免长会话性能退化和重复业务事件。                                                                                                                                                                                           |
| 验证      | 10 次路由切换后只有 1 个 host/监听器；断开触发 `onUnmounted`；heap 可回落。                                                                                                                                                  |

### P1-05 Chrome 标准入口是空白页，核心功能不可发现

| 字段      | 内容                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 安装后首次使用、扩展详情 → Options；Chrome                                                                                                                 |
| 类型      | 信息架构、交互、效率                                                                                                                                       |
| 用户影响  | 新用户从浏览器标准入口得到空白页，容易判断扩展损坏；manifest 又没有 action/popup 指向下一步。                                                              |
| 复现      | 加载 `.output/chrome-mv3` → 打开扩展选项。                                                                                                                 |
| 证据      | [R2] options 的 body 无子元素/文本；[S] `options/index.html:2-16` 是 WXT 占位模板；[B] manifest 声明 `options_ui.page=options.html`，生成 chunk 仅 779 B。 |
| 根因      | 模板 entrypoint 遗留，没有产品化入口。                                                                                                                     |
| 推荐改动  | 快修：删除无效 options 入口；推荐：实现轻量启动页，包含状态、“打开/聚焦 BOSS 职位页”、使用说明与故障排查。不要把 1136px 主 UI 塞进 popup。                 |
| 范围/成本 | options + manifest/action 设计；S（删除）或 M（实现）                                                                                                      |
| 预期收益  | 首次使用从死路变为 1 次明确点击。                                                                                                                          |
| 验证      | 品牌版 Chrome 手工加载，点击图标/options 一步到有效下一步。                                                                                                |

### P1-06 固定 1136px 主面板导致分屏、缩放和窄窗口横向溢出

| 字段      | 内容                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 页面/流程 | 全部 content UI；Chrome                                                                                            |
| 类型      | 响应式、视觉、效率、无障碍                                                                                         |
| 用户影响  | 1024px、分屏、125%–400% 缩放时页面级横滚，右侧控件/宿主页面被挤出；配置截图中右侧“预设”已被裁切。                  |
| 复现      | 1024 CSS px 或当前隔离浏览器默认窗口加载。                                                                         |
| 证据      | [R3] `1224 > 1022`；[S] `App.vue:149-162` 同时 `w-284 max-w-284 min-w-284 m-10`；头部和 tab 工具带缺少响应式换行。 |
| 根因      | 固定 width/min-width/max-width 加外边距，无 viewport-safe 上限。                                                   |
| 推荐改动  | `w-full max-w-284 min-w-0`，外层 `max-width:calc(100vw - 2rem)`；头部/操作栏允许 wrap；表单窄屏单列。              |
| 范围/成本 | `App.vue`、Config/AI 操作栏；S–M                                                                                   |
| 预期收益  | 直接消除横向滚动，提高缩放可用性。                                                                                 |
| 验证      | 800/1024/1280px、125%/200%/400%；断言 `scrollWidth <= clientWidth`，所有操作可达。                                 |

### P1-07 配置表单复用同一 ID，label 无法唯一指向控件

| 字段      | 内容                                                                                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 配置 → 筛选/薪资/公司规模；AI 模型动态字段；Chrome                                                                                                                          |
| 类型      | 无障碍、表单正确性                                                                                                                                                          |
| 用户影响  | 屏幕阅读器、语音控制和 label 点击无法区分“启用字段”和字段值；范围端点无法读成最低/最高。                                                                                    |
| 复现      | 展开筛选配置，检查 checkbox/input ID 与 Accessibility Tree。                                                                                                                |
| 证据      | [R5] 运行时重复 `v-12/v-13/v-14`；[S] `FormItem.vue:15-38` 单个 UFormField 同时包含 checkbox 与 slot；`LLMFormItem.vue:46-104` 同一模式；SalaryRange 还有两个 number 输入。 |
| 根因      | 把复合字段建模成一个 FormField/input ID。                                                                                                                                   |
| 推荐改动  | 使用 fieldset/legend；启用 checkbox 独立 ID/name；值控件唯一 ID；最低/最高独立 label，单位用 `aria-describedby`。                                                           |
| 范围/成本 | form 共享组件、AI 表单；M                                                                                                                                                   |
| 预期收益  | 一次修复覆盖大量配置项，并降低未来回归。                                                                                                                                    |
| 验证      | DOM 无重复 ID；axe label/duplicate-id 通过；NVDA 逐项读出字段名、端点和单位。                                                                                               |

### P1-08 帮助模式完全依赖指针 hover，键盘/触控/屏幕阅读器不可达

| 字段      | 内容                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 全部 `data-help` 配置；Chrome                                                                                                                                 |
| 类型      | 无障碍、信息架构                                                                                                                                              |
| 用户影响  | 键盘和触控用户拿不到配置解释，而首屏又要求用户“先阅读完整帮助”。                                                                                              |
| 复现      | 启用帮助后只用 Tab/触控访问带 `data-help` 控件。                                                                                                              |
| 证据      | [S] `App.vue:76-108` 用 `elementFromPoint` 和 pointer 坐标；`:182-184` 只监听 pointermove/mouseenter/mouseleave；帮助文本未通过 `aria-describedby` 关联目标。 |
| 根因      | 帮助架构绑定命中测试，而非控件 focus/语义。                                                                                                                   |
| 推荐改动  | 表单说明放 UFormField description/help；非表单项提供可聚焦帮助按钮；focus/hover/触控均可打开，Esc 关闭。                                                      |
| 范围/成本 | App 帮助层 + 表单共享组件；M                                                                                                                                  |
| 预期收益  | 同时改善首用理解和 WCAG 键盘/触控可达性。                                                                                                                     |
| 验证      | 无鼠标完成配置，说明可读；Accessibility Tree 有描述关系。                                                                                                     |

### P1-09 岗位详情切换是鼠标专用 `div`

| 字段      | 内容                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 页面/流程 | 岗位卡片；Chrome                                                                                                               |
| 类型      | 无障碍、交互                                                                                                                   |
| 用户影响  | 键盘用户不能展开/收起岗位描述。                                                                                                |
| 复现      | Tab 遍历岗位卡；按 Enter/Space。                                                                                               |
| 证据      | [R4] Tab 只进入岗位标题链接，不进入详情切换；[S] `JobCard.vue:79-87` 两个 div 只有 `@click`，无 button/role/tabindex/keydown。 |
| 根因      | 非语义元素承担按钮行为。                                                                                                       |
| 推荐改动  | 使用原生 button，“展开/收起职位详情”，并提供 `aria-expanded`、`aria-controls`。                                                |
| 范围/成本 | `JobCard.vue`；S                                                                                                               |
| 预期收益  | 恢复键盘等价操作，语义更清晰。                                                                                                 |
| 验证      | Tab → Enter/Space 切换，NVDA 宣告展开状态。                                                                                    |

### P1-10 AI 功能启停只靠颜色，设置按钮缺少名称

| 字段      | 内容                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 页面/流程 | AI tab；Chrome                                                                                                                       |
| 类型      | 无障碍、视觉、交互                                                                                                                   |
| 用户影响  | 用户只看到功能名，无法从文本/AT 判断开关状态；关闭被红色编码为错误；齿轮按钮只读成“按钮”。                                           |
| 复现      | 灰度/高对比或屏幕阅读器检查 AI 开关。                                                                                                |
| 证据      | [S] `FormSwitch.vue:20-29` 主按钮与设置按钮共同使用 `data.enable ? success : error`；无 `aria-pressed`，设置按钮无 accessible name。 |
| 根因      | 状态、动作、错误三种语义共用颜色。                                                                                                   |
| 推荐改动  | 标准 USwitch 或 `aria-pressed`；可见“已启用/已停用”；设置按钮 `aria-label="配置 {label}"`，neutral/ghost。                           |
| 范围/成本 | `FormSwitch.vue`；S                                                                                                                  |
| 预期收益  | 状态无需颜色即可理解，减少误判。                                                                                                     |
| 验证      | Accessibility Tree 显示 pressed/on/off；灰度仍可区分。                                                                               |

### P1-11 岗位状态文字存在确定的对比度失败

| 字段      | 内容                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | 岗位卡状态、薪资和作者信息；Chrome                                                                                                  |
| 类型      | 无障碍、视觉                                                                                                                        |
| 用户影响  | 低视力、低亮度或眩光环境难以读取处理结果和关键岗位信息。                                                                            |
| 复现      | 对 `stateMaps` 各背景与白字计算对比度。                                                                                             |
| 证据      | [R6] 6 种状态中 5 种低于 4.5:1；[S] `JobCard.vue:18-27` 色值，`main.css:130-145` 12px 白字；薪资 `#ff442e`、作者 `#a09f9f` 也偏低。 |
| 根因      | palette 按装饰色选择，未按文字对比设计。                                                                                            |
| 推荐改动  | 状态 token 同时定义前景/背景；深化背景或改深色前景；加自动 contrast test。                                                          |
| 范围/成本 | `JobCard.vue`、design tokens；S                                                                                                     |
| 预期收益  | 提升状态辨识并形成可复用视觉规则。                                                                                                  |
| 验证      | axe/Playwright contrast + Windows 高对比模式。                                                                                      |

### P1-12 CI/发布工作流已与当前构建系统漂移

| 字段      | 内容                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 页面/流程 | UX 回归保障与发布；Chrome                                                                                                                                                                      |
| 类型      | 测试、构建质量                                                                                                                                                                                 |
| 用户影响  | UI、options、manifest 或键盘回归无法由发布门禁拦截；当前 workflow 构建步骤本身不可执行。                                                                                                       |
| 复现      | `npm run build:noTsc`；检查 `dist/`。                                                                                                                                                          |
| 证据      | [B] 命令返回 `Missing script: build:noTsc`，`dist` 不存在；[S] `.github/workflows/main.yml:52-58` 调该脚本并上传 `dist/*`，而 package 只定义 WXT `.output` 构建；workflow 无 test/lint/check。 |
| 根因      | CI 仍指向旧脚本与旧产物路径。                                                                                                                                                                  |
| 推荐改动  | 按锁文件使用包管理器；依次 test/lint/check/build:chrome/built verifier；上传实际 Chrome zip/目录。                                                                                             |
| 范围/成本 | GitHub Actions + scripts；S                                                                                                                                                                    |
| 预期收益  | 让后续 UI 修复具备可执行质量门禁。                                                                                                                                                             |
| 验证      | workflow_dispatch 全绿，artifact 可在 Chrome 手工加载。                                                                                                                                        |

### P2-01 配置持久化语义不一致，成功反馈早于真正持久化

- **影响**：推荐、导入、清空和模型增删改容易被误认为已保存；取消/刷新会丢失用户认为已成功的内容。
- **证据**：[S] 核心配置只在 `Config.vue:544-598` 底部保存；`conf/index.ts:341-389` 推荐/导入/清空只改内存并提示；外观自动保存；AI 开关立即保存；`LLMModelManage.vue:14-33,135-147` 删除/复制先提示成功，仍需外层保存。
- **根因**：多个设置子系统独立演进，无统一 dirty/persist 语义。
- **建议/成本**：优先原子持久化；若保留批量提交，提供全局 dirty、离开确认、固定保存栏，并把内层“保存”改为“应用”；M。
- **验证**：关闭、取消、刷新、保存失败、导入退出均与 storage 实值一致。

### P2-02 停止原因未进入主控状态，恢复需要切换日志

- **影响**：批次完成、连续失败、无更多岗位、上下文失效和手动暂停都只显示“继续”；错误情况下继续可能重复失败。
- **证据**：[S] `useApplying/index.ts:370-503` 已生成结构化原因并最终只写日志/notification；`Statistics.vue:133-165` 只根据 status 显示开始/继续/暂停，不消费 `errorMessage/stepMsg`。
- **建议/成本**：进度旁持久显示原因，按原因提供“下一批/重试/打开配置/刷新”；手动暂停与异常暂停分开；S–M。
- **验证**：覆盖批次满、连续失败、无岗位、手动暂停、上下文失效。

### P2-03 首次使用说明组件不可达，首屏直接暴露六个 tab

- **影响**：新用户需要自行理解配置启用、保存、帮助和风险，学习成本高。
- **证据**：[S] `AppMenu.vue:69-104` 有首次说明 modal，但 `main.ts:348-351` 注入被注释；实际只注入主应用；`App.vue:24-35` 直接展示六 tab。
- **建议/成本**：在主应用做可跳过、可重开的 3 步清单：场景确认 → 推荐/自定义规则 → 试运行；风险说明与教程分层；M。
- **验证**：清空 extension storage 后，不读 README 也能完成首次安全试运行。

### P2-04 岗位卡片重叠与旋转动效妨碍高频扫描

- **影响**：标题/标签被邻卡遮挡，必须逐张悬停比较；悬停使后续卡移动 130px，视线跳动。
- **证据**：[R] 主界面截图出现横向卡片带；[S] `main.css:108-125` 固定卡宽高，`:214-230` rotate/translate 与 `margin-left:-130px`。
- **建议/成本**：改无重叠横向列或响应式 grid；删除旋转和邻卡位移，仅保留边框/阴影反馈；M。
- **验证**：10 个长职位名/标签，无需悬停即可读标题、薪资、状态。

### P2-05 单体 1.84MB bundle 静态加载全部低频 UI，隐藏视图常驻

- **影响**：每个匹配页面都解析/执行 AI 配置、日志、关于、protobuf 等低频路径；隐藏组件及 watcher 也立即创建。尚未做 CPU profile，因此不声称具体毫秒。
- **证据**：[B] `boss.js` raw 1,843,302 B、gzip-9 526,748 B；[S] `App.vue:6-14` 静态导入 ChatBox 与六 tab，`:214-230` `unmount-on-hide=false`；无 `import()`/`defineAsyncComponent`。
- **建议/成本**：异步加载 AI 配置/Prompt 编辑/日志/关于/模型测试；首屏只保留统计与必要筛选；先测量再评估 protobuf minimal；建立 size budget；M–L。
- **验证**：构建体积基线 + Chrome Performance 冷启动 scripting/long task/首次可交互对比。

### P2-06 聊天抽屉关闭时仍永久运行动画，且不尊重 reduced motion

- **影响**：从不打开聊天也每 120ms 替换 reactive Set，每 3 秒执行 15 帧 RAF；路由泄漏后会倍增；运动敏感用户无法关闭卡片/加载动效。
- **证据**：[S] `App.vue:255-256` 始终挂载 ChatBox；`ChatBox.vue:524-535` 无条件启动 interval/RAF；全仓无 `prefers-reduced-motion`；`main.css` 含多处 transform/transition。
- **建议/成本**：只在 `open && streaming` 时启动，关闭/结束立即 clear；reduce 模式用静态文本、auto scroll、禁用卡片位移；S。
- **验证**：fake timers 10 秒，关闭状态回调数为 0；系统 Reduce Motion 下无 scramble/位移。

### P2-07 动态错误/新消息没有 live-region 语义

- **影响**：焦点留在 textarea/按钮时，“生成失败”“已有新消息”可能不被屏幕阅读器宣告。
- **证据**：[S] `ChatBox.vue:666-679` 条件渲染 UAlert；当前 Nuxt UI Alert 根元素不默认提供 `role=alert/aria-live`；全仓无 `aria-live`。
- **建议/成本**：错误 `role=alert` 或 assertive；普通状态 `role=status aria-live=polite`，避免重复播报；S。
- **验证**：NVDA 焦点不移动，状态自动且只播报一次。

### P2-08 Prompt、模型测试和聊天输入缺少持久且唯一的标签

- **影响**：屏幕阅读器/语音输入难以区分第 N 条角色/内容、测试输入/输出和聊天草稿；placeholder 消失后没有持久名称。
- **证据**：[S] `LLMPromptEdit.vue:523-542` 每条 Select/Textarea 无 label；`LLMModelEdit.vue:322-325` 两 textarea 只有 placeholder；`ChatBox.vue:680-687` 同样只有 placeholder。
- **建议/成本**：UFormField label 或带序号 aria-label；输出标 readonly + label；S。
- **验证**：Accessibility Tree 中每个 textarea/select 名称唯一且持久。

### P2-09 自动化测试没有覆盖 content UI、键盘、状态、响应式和迁移

- **影响**：本报告中的大多数高风险回归当前都不会被 `npm test` 发现。
- **证据**：[S/B] package 无组件/E2E 测试依赖；12 个 `verify-*.mjs` 中只有 4 个进入 `npm test`；现有 built 分支未默认运行；无 `*.spec.*`/`*.test.*`。
- **建议/成本**：见第 11 节；先 built artifact verifier、预设/迁移单测、App 交互组件测试、Chrome content UI smoke E2E；M。
- **验证**：故意恢复空白 options、重复 ID、固定宽度或预设断线，CI 必须失败。

### P2-10 未发送的 AI 回复草稿刷新或重挂后丢失

- **影响**：用户编辑中的多会话草稿在刷新/SPA 重挂后消失。
- **证据**：[S] `ChatBox.vue:27-101` 草稿是组件局部 reactive Map，无 session/storage 持久化；P1-04 重挂会创建新 Map。
- **建议/成本**：按 conversationId 节流写 session storage，发送后删除；不要写 sync storage；S–M。
- **验证**：两会话草稿刷新后分别恢复，发送后对应 key 清除并有过期清理。

### P3-01 帮助 tooltip 使用拼错的文本 token

- **证据**：`App.vue:175-179` 使用 `text-highlighte`；构建 CSS 只有 `text-highlighted`。
- **影响**：文本继承颜色，主题/宿主变化时可能低对比。
- **建议/成本**：改 `text-highlighted`；S。

### P3-02 配置保存帮助文案与实现不一致

- **证据**：`Config.vue:546` 声称“保存配置，会自动刷新页面”；`conf/index.ts:274-317` 只写 storage/toast，刷新逻辑不存在。
- **影响**：用户等待并不存在的刷新，误判保存状态。
- **建议/成本**：修正文案；除非产品确有必要，不要为匹配文案增加整页刷新；S。

### P3-03 `scrollbar-gutter: always` 是无效值

- **证据**：`main.css:48`；Chrome 会忽略该声明。
- **影响**：卡片滚动区没有按作者意图预留 gutter，布局稳定性不可控，但当前影响轻微。
- **建议/成本**：若需预留空间改为 `stable`，否则删除；S。

## 5. Quick wins（0.5–2 开发日）

| 顺序 | 改动                                                  | 预计成本 | 收益                | 验证               |
| ---- | ----------------------------------------------------- | -------: | ------------------- | ------------------ |
| 1    | 接通 `switchPreset()`，补 A/B 预设测试                |     0.5d | 防止数据覆盖        | 单测 + 手工切换    |
| 2    | start readiness gate，加载失败 fail closed            |   0.5–1d | 防止默认配置误投    | 延迟/拒绝 fixture  |
| 3    | 主容器 `min-w-0` + viewport-safe max + 操作栏 wrap    |   0.5–1d | 消除横向滚动        | 800/1024/200%      |
| 4    | FormSwitch 改 switch/aria-pressed，齿轮补名称         |     0.5d | 明确状态、提升 a11y | AX Tree/灰度       |
| 5    | JobCard 详情改原生 button                             |     0.5d | 键盘等价操作        | Tab/Enter/Space    |
| 6    | 修复状态色对比度并 token 化                           |     0.5d | 状态清晰            | contrast 自动检查  |
| 7    | ChatBox 动画只在可见且 streaming 时运行               |     0.5d | 降低常驻 CPU        | fake timer         |
| 8    | 修复 `text-highlighte`、错误保存文案、scrollbar value |    <0.5d | 清理确定小缺陷      | DOM/computed style |
| 9    | 删除空白 options（若短期不实现启动页）                |    <0.5d | 消除标准入口死路    | manifest/手工加载  |
| 10   | 修复 CI 脚本和 artifact 路径                          |   0.5–1d | 恢复交付门禁        | workflow_dispatch  |

## 6. Strategic improvements

1. **单一状态源治理**：统计 store、配置 readiness、保存/dirty 语义统一。先解决正确性，再调整视觉。
2. **Web Component 生命周期治理**：mount/unmount/dispose 成对，所有 document listener、timer、watch/router hook 可追踪清理。
3. **复合表单语义组件**：fieldset/legend、启用控制、值控件、范围端点、描述关系形成统一 API。
4. **信息架构收口**：轻量启动页、3 步首用清单、主控停止原因、设置操作分组。
5. **任务型卡片设计**：从装饰性堆叠改为可快速比较的列表/grid，减少运动与遮挡。
6. **按功能切块**：AI/Prompt/日志/关于/测试工具延迟加载，以构建 size budget 和 Chrome trace 驱动。
7. **可访问性基线**：语义控件、唯一名称、live region、reduced motion、4.5:1 contrast 进入 CI。

## 7. Cross-browser matrix

按用户后续指示，本轮只审查 Chrome，不再单独评估 Edge/Firefox。仓库静态比对显示三端核心 `boss.js`/content UI 共享同一实现，但本报告不以此替代另外两端运行验证，也不列出它们的专属差异。

| 项目                   | Chrome 结论                                 |
| ---------------------- | ------------------------------------------- |
| Manifest               | MV3 service worker                          |
| Popup/action           | 无                                          |
| Options                | 有入口但为空白，P1-05                       |
| Content UI             | 真实 Chromium 加载并完成有限交互验证        |
| 业务副作用操作         | 未执行开始、保存、发送                      |
| 品牌版 Chrome 手工加载 | 待人工验收；CLI load-extension 被品牌版忽略 |

## 8. Accessibility findings

### 已确认

- 重复 ID 与复合字段 label 错配（P1-07，含运行证据）。
- 岗位详情鼠标专用（P1-09，含 Tab 序列证据）。
- 帮助 pointer-only（P1-08）。
- AI 开关只靠颜色且无状态语义（P1-10）。
- 岗位状态对比度失败（P1-11，含计算证据）。
- 动态错误无 live region（P2-07）。
- 多个 textarea/select 缺唯一持久名称（P2-08）。
- 固定宽度造成 reflow/zoom 失败（P1-06，含运行证据）。
- 动画不尊重 reduced motion（P2-06）。

### 高概率问题（需运行确认后再定性）

- ChatBox `modal=false`，打开后焦点可能留在触发器并穿过后台内容。
- `UPopover mode="hover"` 的岗位预览/赞赏码是否支持 focus 打开，取决于运行时组件行为。
- Shadow DOM 未显式设置 `lang="zh-CN"`，语言从宿主页继承；当前运行页 `documentElement.lang` 为空，需要检查 host/AT 的实际语言继承。

### 人工验证项

- 品牌版 Chrome + NVDA：Tabs、Dropdown、Select、Accordion、Modal 的方向键、Enter/Space、Esc、focus trap/restore。
- Windows Forced Colors 下的 focus-visible ring、状态 token 与 xs icon 按钮。
- 320 CSS px、400% zoom、200% 文本、超长模型名/岗位名。
- Toast 是否由 Nuxt Toaster 正确 live announce。
- 触控目标是否达到至少 24×24 CSS px。

## 9. Performance and perceived-speed findings

### 已确认

- `boss.js` 单体 1.84 MB raw / 526.7 KB gzip-9，全部 tab 静态导入且隐藏视图不卸载（P2-05）。
- ChatBox 关闭时仍有约 8.33 次/秒 reactive Set 替换，并周期启动 RAF（P2-06）。
- Web Component 没有 teardown，路由重挂可累积 timer/listener（P1-04）。
- 主面板先呈现、配置/模型异步初始化，导致“看起来可点”早于“可以安全操作”（P1-01）。

### 不足以定性的机会

- 当前页面运行时约 9,806 个 DOM nodes、JS heap used 约 43.6 MB，但包含完整 BOSS 页面，不能归因于扩展。
- 未做冷启动 CPU profile，不能声称 1.84 MB 带来具体 TTI 延迟。
- 岗位最多约 150 个，尚无 long-task/掉帧证据支持立即引入虚拟列表。

建议先建立 Chrome Performance trace 与 coverage 基线，再决定依赖拆分和虚拟化，不要凭 bundle 大小过度重构。

## 10. Recommended implementation roadmap

### Phase 1：低风险高收益（1–3 天）

| 内容                              | 涉及文件                          | 依赖                 | 风险                | 验证                  |
| --------------------------------- | --------------------------------- | -------------------- | ------------------- | --------------------- |
| readiness gate + fail closed      | App、Statistics、conf/model、main | 无                   | 开始按钮状态变化    | 延迟/拒绝 storage     |
| 预设接 `switchPreset()`           | Config、conf                      | readiness 状态可复用 | 切换失败回滚        | A/B 预设测试          |
| 响应式容器与操作栏                | App、Config                       | 无                   | 宿主页面布局        | 800–1280px/zoom       |
| AI toggle、JobCard button、状态色 | FormSwitch、JobCard、tokens       | 无                   | 视觉快照变化        | AX/contrast/键盘      |
| 关闭 ChatBox 空闲动画             | ChatBox                           | 无                   | streaming indicator | fake timer + 手工流式 |
| 空白 options 决策、CI 修复        | options、workflow、scripts        | 产品决定删除或实现   | 发布 artifact 变化  | 品牌版 Chrome load    |

### Phase 2：核心流程优化（3–7 天）

| 内容                     | 涉及文件                                      | 依赖                 | 风险          | 验证               |
| ------------------------ | --------------------------------------------- | -------------------- | ------------- | ------------------ |
| 统计 singleton + hydrate | useStatistics、Helper、Statistics、Appearance | 先写迁移/旧值测试    | 历史数据      | 旧值 +1/刷新一致   |
| 保存语义统一             | conf、AI model、Config                        | readiness/dirty 模型 | 设置迁移      | 取消/刷新/失败矩阵 |
| 主控停止原因与情境动作   | useApplying、Statistics                       | 错误类型映射         | workflow 行为 | 五种停止原因       |
| 首用清单/轻量入口        | App 或 options                                | 产品文案             | 首次安装状态  | 清空 storage 验收  |
| 帮助 focus/touch/AT 化   | App、form components                          | 表单语义组件         | tooltip 行为  | 键盘/触控/NVDA     |
| session 草稿             | ChatBox、storage                              | 隐私保留策略         | 敏感文本存储  | 恢复/发送/过期     |

### Phase 3：设计系统与架构治理（1–3 周）

| 内容                           | 涉及文件                     | 依赖               | 风险               | 验证                    |
| ------------------------------ | ---------------------------- | ------------------ | ------------------ | ----------------------- |
| Web Component dispose 生命周期 | index、Helper、main/router   | 明确所有资源 owner | 站内路由           | 10 次导航 heap/listener |
| 卡片列表重设计                 | JobCards、JobCard、main.css  | 响应式基线         | 高频视觉变化       | 长文本/10–150 卡        |
| 语义 design tokens             | wxt config、main.css、组件   | 对比度基线         | 全局视觉           | snapshot + contrast     |
| AI/日志等异步切块              | App、AI/Logs/About、protobuf | size/trace 基线    | chunk/CSP/加载状态 | build + 冷启动 trace    |
| 组件/E2E/视觉回归体系          | tests、workflow              | CI 已恢复          | 测试维护成本       | PR 必跑门禁             |

实施顺序必须先修正确性和状态模型，再做大范围视觉/切块重构，以减少回归定位成本。

## 11. Test plan

### 11.1 最小自动化补充

1. `scripts/verify-built-artifacts.mjs`
   - 解析 Chrome manifest。
   - 断言所有引用文件存在。
   - 断言暴露的 HTML 有可见 landmark/app mount；空白 options 必须失败。
   - 验证 background DOM-free、content/main-world 注册正确。

2. `tests/unit/conf-preset.test.ts`
   - A/B 预设切换、失败回滚、保存隔离。
   - readiness 延迟/拒绝；start fail closed。

3. `tests/unit/statistics.test.ts`
   - hydrate 旧当天数据、+1、不覆盖、跨日归档、幂等。
   - 只创建一个 store/watcher。

4. `tests/unit/conf-migration.test.ts`、`model-migration.test.ts`
   - 旧 key、旧版本对象、缺字段、字符串 prompt、幂等、保留用户未知值。

5. `tests/component/App.interactions.test.ts`
   - 初始化 loading/error。
   - 保存成功/失败、dirty/离开。
   - tab、modal、alert live region、复合字段唯一 ID/name。

6. `tests/e2e/content-ui.smoke.spec.ts`（Chrome）
   - 加载 unpacked MV3、注入 host、service worker 无错误。
   - 轻量入口/options 不为空。
   - tab/keyboard、帮助、岗位详情。
   - 800/1024px、200%/400%、长文本。
   - 停止原因、storage 拒绝、旧数据迁移。
   - 关键截图：统计、配置、AI、日志、对话。

### 11.2 现有脚本治理

当前 12 个 `verify-*.mjs` 只有 4 个进入 `npm test`。建议拆分：

- `test:unit`：纯函数/状态测试。
- `test:source-contract`：现有 source verifier。
- `test:built`：`build:chrome` 后校验 manifest、HTML、background、bundle。
- `test`：聚合前两者；CI 再执行 build + test:built。

### 11.3 人工验收

- 品牌版 Chrome，开发者模式加载 `.output/chrome-mv3`。
- 新 profile/空 storage：入口 → 首用 → 配置 → 试运行（使用安全 fixture，禁止真实批量投递）。
- 预设 A/B、配置失败、storage 拒绝、扩展 context invalidated。
- 键盘全流程：Tab、Shift+Tab、方向键、Enter、Space、Esc、focus restore。
- NVDA、Windows Forced Colors、Reduce Motion。
- 800/1024/1280/1440px，125%/200%/400%，长中文/英文。
- Chrome Performance 冷启动与 10 次 SPA 路由切换。

## 12. Unverified areas

- 品牌版 Google Chrome 通过扩展管理 UI 手工加载后的最终 smoke；本轮使用隔离 Playwright Chromium 加载真实 MV3 产物。
- 开始投递、保存配置、发送聊天等有外部副作用的动作未执行。
- 空数据、真实权限拒绝、扩展 context invalidated、连续失败、批次结束等运行状态未主动制造。
- NVDA/屏幕阅读器、Forced Colors、系统 Reduce Motion 未实机执行。
- 200%/400% zoom、320 CSS px、超长模型/岗位文本尚未逐一截图。
- 冷启动 CPU trace、bundle coverage 和 10 次路由 heap 对比未执行。
- Edge/Firefox 按用户后续要求不在本轮范围。

## 13. Verification record

| 命令/检查              | 结果     | 说明                                                                                    |
| ---------------------- | -------- | --------------------------------------------------------------------------------------- |
| `npm run build:chrome` | 通过     | 31.4s；Chrome MV3 总约 2.03 MB                                                          |
| `npm run lint`         | 通过     | `oxlint --type-aware`                                                                   |
| `npm test`             | 通过     | boss identity、chat socket entrypoint、AI reply realtime、AI filtering                  |
| `npm run check`        | 失败     | 当前基线 7 个 TS 错误：`LLMForm.vue` 2、`StoreIcons.tsx` 3、`Tabs/Logs.vue` 2           |
| `npm run build:noTsc`  | 不存在   | CI 当前调用该脚本；`dist/` 也不存在                                                     |
| 组件测试               | 未执行   | 仓库无命令/框架                                                                         |
| E2E/视觉回归           | 未执行   | 仓库无命令/框架                                                                         |
| Chrome MV3 runtime     | 部分通过 | service worker、options、content UI、tab 切换、Tab 顺序、DOM/截图完成；副作用流程未执行 |

首次并行执行多端 build 时，另一个仍在运行的构建占用 `.output/firefox-mv2`，导致一次 `EPERM rmdir`；待进程退出后单端构建均可通过。用户随后将范围收窄为 Chrome，因此该并发冲突不计入产品缺陷。

## 14. Positive observations

- AI 回复对“已有新消息”和“生成失败”已有持久内联视觉反馈。
- 用户编辑过的草稿不会被新到达消息直接覆盖。
- 工作流已有连续失败熔断、批次上限和结构化停止原因；无需重写执行机制，只需安全门禁与 UI 暴露。
- `useRafFn` 帮助 overlay 在帮助不可见时会 pause，说明代码中已有正确按可见性管理工作的模式，可复用于 ChatBox 动画。
- Chrome background bundle 构建和 DOM-free 回归脚本已有基础，可扩展为统一 built artifact gate。

## 15. 待验证机会（不作为确定缺陷）

- 是否需要开始/暂停、打开对话、发送回复快捷键；manifest 当前没有 commands，但缺少用户研究证据。
- 是否记忆上次 tab、对话开关和选中会话；需验证恢复上下文是否真的减少操作。
- 默认自动投递/自动招呼/每批 120 是否应改为更保守预设；这是产品策略，不能仅凭代码定性。
- 岗位列表是否需要虚拟化；当前缺少 long-task/掉帧证据。
- 暗色模式策略：Nuxt UI `colorMode:false`、遗留 `html.dark` 和硬编码亮色并存，但需要 Dark Reader/实际 computed style 截图后再决定支持或明确不支持。
