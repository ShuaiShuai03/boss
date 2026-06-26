# Boss-Helper

首先向原项目作者 [Ocyss](https://github.com/Ocyss) 以及所有早期贡献者表达尊重和感谢。Boss-Helper 的基础能力、产品方向和开源积累来自原作者长期维护的工作，本仓库是在此基础上的延续、修复和增强版本，希望让更多求职者可以更稳定、更灵活地使用自己的自动化与 AI 工具。

> [!CAUTION]
> 本项目仅供学习、研究和个人效率探索，请遵守招聘平台规则和相关法律法规。
>
> 自动化投递、自动化沟通和第三方模型调用都可能带来账号风控、信息误发或隐私泄露风险。使用前请充分理解配置含义，并自行承担使用结果。

## 项目简介

Boss-Helper 是一个面向 Boss 直聘网页端的浏览器扩展，目标是减少重复筛选、投递和沟通成本，让求职者把时间更多投入到岗位判断、简历打磨和面试准备上。

当前版本基于 WXT、Vue 3、Nuxt UI 4 和 Tailwind CSS 4 构建，并在原有批量处理能力上加强了 AI 配置、模型兼容、异常恢复和提示词个性化能力。

## 本版本的主要改动

- 支持 OpenAI-compatible 的第三方 API 服务，可配置 Base URL、模型名、额外请求头、额外请求体和超时时间。
- 模型配置改为本地存储，降低 API Key 进入同步存储的风险，并兼容旧配置迁移。
- 修复 AI 配置保存、模型读取、扩展重载后上下文失效、岗位详情等待和投递重试等稳定性问题。
- 优化 AI 筛选、AI 招呼语和 AI 回复的默认提示词，默认内容使用通用占位符，避免公开仓库暴露个人简历信息。
- 为 AI 筛选和 AI 回复增加个性化 System Prompt 优化入口，用户可输入排除岗位、目标方向、回复语气等要求，由模型辅助生成更贴合个人求职策略的提示词。
- 改进错误提示和测试反馈，让模型缺失、JSON 配置错误、AI 超时和请求失败更容易定位。

## 功能概览

- 批量处理岗位卡片，按页执行筛选、投递和日志记录。
- 基于岗位名、公司、岗位内容、HR 职位、薪资、公司规模、活跃度、已沟通状态、相同公司和相同 HR 进行规则筛选。
- 支持高德地图距离与时间筛选，需要用户自行配置高德 API Key。
- 支持自定义招呼语模板和 AI 生成招呼语。
- 支持 AI 岗位过滤，按岗位详情与个人背景输出加分/扣分 JSON。
- 支持 AI 聊天回复，根据岗位信息和 HR 上下文生成可编辑草稿。
- 支持本地日志查看，便于回溯每个岗位的处理结果、AI 输入和 AI 输出。

## AI 能力

本项目不绑定单一模型供应商。只要服务兼容 OpenAI Chat Completions 风格接口，通常都可以通过模型配置接入，例如：

- OpenAI 官方 API
- 兼容 OpenAI 协议的中转服务
- 第三方大模型服务
- 私有化或本地部署的 OpenAI-compatible 网关

建议用户先在“模型配置”中完成连接测试，再分别测试 AI 筛选、AI 招呼语和 AI 回复。默认提示词中的 `[求职者姓名]`、`[目标岗位方向]`、`[核心技能]`、`[项目 A]` 等内容需要替换为自己的真实背景。

## 安装与使用

1. 克隆仓库并安装依赖：

   ```bash
   npm install
   ```

2. 构建 Chrome 扩展：

   ```bash
   npm run build:chrome
   ```

3. 打开浏览器扩展管理页面，启用开发者模式，选择“加载已解压的扩展程序”，加载：

   ```text
   .output/chrome-mv3
   ```

4. 打开 Boss 直聘岗位列表页，按需配置筛选规则、模型和 AI 提示词。

## 三端构建

构建解压目录：

```bash
npm run build
```

生成发布压缩包：

```bash
npm run zip
```

常用单端命令：

```bash
npm run build:chrome
npm run build:edge
npm run build:firefox
npm run zip:chrome
npm run zip:edge
npm run zip:firefox
```

构建产物位于 `.output/`。该目录默认不纳入 Git 版本管理，请按浏览器商店或手动安装需求自行取用。

## 开发命令

```bash
npm run dev
npm run check
npm run lint
npm run build
```

如果修改了模型、配置保存、提示词或投递流程，建议额外运行 `scripts/` 下的验证脚本。

## 项目预览

[![卡片状态](docs/img/shot_2024-04-14_23-08-03.png)](docs/img/shot_2024-04-14_23-08-03.png)
[![账户配置](docs/img/shot_2024-04-14_23-09-05.png)](docs/img/shot_2024-04-14_23-09-05.png)
[![统计界面](docs/img/shot_2024-04-02_22-25-25.png)](docs/img/shot_2024-04-02_22-25-25.png)
[![配置界面](docs/img/shot_2024-04-02_22-26-54.png)](docs/img/shot_2024-04-02_22-26-54.png)
[![日志界面](docs/img/shot_2024-04-02_22-32-25.png)](docs/img/shot_2024-04-02_22-32-25.png)

## 贡献

欢迎提交 Issue 和 Pull Request。为了让维护更高效，请尽量：

1. 保持改动聚焦，避免把功能、格式化和大规模重构混在一起。
2. 描述清楚复现路径、预期行为和实际行为。
3. 涉及 AI、配置保存或投递流程时，补充对应验证命令或手工验证记录。
4. 不要提交个人简历、API Key、Cookie、Token 或浏览器本地配置。

## 鸣谢

- 原项目：[Ocyss/boss-helper](https://github.com/Ocyss/boss-helper)
- [yangfeng20/boss_batch_push](https://github.com/yangfeng20/boss_batch_push)
- [lisonge/vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey)
- [chatanywhere/GPT_API_free](https://github.com/chatanywhere/GPT_API_free)
- [uiverse.io](https://uiverse.io/)
- [MQTT 3.1.1 中文协议文档](https://www.runoob.com/manual/mqtt/protocol/MQTT-3.1.1-CN.pdf)

## 类似项目

- [Frrrrrrrrank/auto_job__find__chatgpt__rpa](https://github.com/Frrrrrrrrank/auto_job__find__chatgpt__rpa)
- [noBaldAaa/find-job](https://github.com/noBaldAaa/find-job)

## Star 趋势

<a href="https://star-history.com/#ocyss/boss-helper&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ocyss/boss-helper&type=Date" />
 </picture>
</a>
