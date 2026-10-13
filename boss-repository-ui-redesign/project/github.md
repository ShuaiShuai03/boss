repo: ShuaiShuai03/boss
branch: main
path: src

## Last sync

date: 2026-08-07T02:58:52Z

### Updated in this project

- Imported the real extension icons (`public/icons/logo.png`, `public/icons/32.png`) and used the logo in the redesigned header.
- New "控制室 / Control Room" visual direction: #12212B ground, #F5A524 accent, Space Grotesk + Noto Sans SC + JetBrains Mono.
- Redesigned the six-tab wall into a persistent Run Bay + five sections (控制台 / 规则 / AI / 日志 / 关于), plus a full-page options dashboard.
- Added a component system page mapping every token back to `jobStatusTokens.ts` and `assets/main.css`.

## Screen map

| Project screen | Built from |
| --- | --- |
| 现状还原 Current UI.dc.html | src/App.vue, src/components/Tabs/Statistics.vue, src/components/JobCard.vue, src/components/JobCards.vue, src/assets/main.css, src/components/jobStatusTokens.ts |
| Control Room · 注入面板 · 控制台 | src/App.vue, src/components/Tabs/Statistics.vue, src/composables/useApplying/stopReason.ts, src/components/JobCards.vue |
| Control Room · 注入面板 · 规则 | src/components/Tabs/Config.vue, src/components/form/FormItem.vue, src/components/form/FormSelect.vue, src/components/form/SalaryRange.vue, src/components/Tabs/Appearance.vue, src/composables/conf/info.ts, src/types/formData.ts |
| Control Room · 注入面板 · AI | src/components/Tabs/AI.vue, src/components/AI/LLMModelManage.vue, src/components/form/FormSwitch.vue, src/composables/conf/info.ts |
| Control Room · 注入面板 · 日志 | src/components/Tabs/Logs.vue, src/components/JobCard.vue |
| Control Room · 注入面板 · 关于 | src/components/Tabs/About.vue, README.md |
| Control Room · 对话抽屉 | src/components/ChatBox.vue, src/features/aiReply/types.ts |
| Control Room · 首次使用引导 | src/App.vue (onboarding section), src/AppMenu.vue (protocol modal) |
| Control Room · 扩展设置页 | src/entrypoints/options/index.html, src/entrypoints/options/style.css |
| Control Room · 组件库 | src/components/jobStatusTokens.ts, src/assets/main.css, src/entrypoints/boss/inject.css |

## Imported assets

| Project path | Repo path |
| --- | --- |
| public/icons/logo.png | public/icons/logo.png |
| public/icons/32.png | public/icons/32.png |

## Sync history

- 2026-08-07T02:29:06Z — initial read of src/ (App.vue, Tabs/*, components/*, composables/conf, types/formData.ts, entrypoints/options) and full UI recreation.
