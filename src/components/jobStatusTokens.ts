import type { JobStatus } from '../composables/useApplying/type'

export interface JobStatusToken {
  /**
   * 渲染用的 CSS 变量：柔和底 + 同色文字，深浅主题只换变量值。
   * 岗位卡片状态条和日志结果标记共用这一份。
   */
  soft: string
  color: string
  /**
   * 深色主题下 soft / color 合成后的实际取值。
   * 保留 hex 是为了让对比度契约测试（scripts/verify-state-foundations.mjs）
   * 能直接算 WCAG 比值，同时作为变量不可用时的兜底。
   */
  background: string
  foreground: string
  label: string
  /** 状态标记上的等宽英文，例如 SUCCESS / WARN。 */
  en: string
}

export const jobStatusTokens: Record<JobStatus, JobStatusToken> = {
  pending: {
    soft: 'var(--cr-surf3)',
    color: 'var(--cr-mute-on)',
    background: '#1e3949',
    foreground: '#9fb6c1',
    label: '待处理',
    en: 'PENDING',
  },
  wait: {
    soft: 'var(--cr-surf3)',
    color: 'var(--cr-mute-on)',
    background: '#1e3949',
    foreground: '#9fb6c1',
    label: '等待中',
    en: 'WAIT',
  },
  error: {
    soft: 'var(--cr-err-soft)',
    color: 'var(--cr-err-on)',
    background: '#2e323b',
    foreground: '#ff6b5a',
    label: '失败',
    en: 'ERROR',
  },
  warn: {
    soft: 'var(--cr-acc-soft)',
    color: 'var(--cr-acc-on)',
    background: '#2d3836',
    foreground: '#f5a524',
    label: '已跳过',
    en: 'WARN',
  },
  success: {
    soft: 'var(--cr-ok-soft)',
    color: 'var(--cr-ok-on)',
    background: '#1d3d40',
    foreground: '#4fd98b',
    label: '成功',
    en: 'SUCCESS',
  },
  running: {
    soft: 'var(--cr-info-soft)',
    color: 'var(--cr-info-on)',
    background: '#1e3a4c',
    foreground: '#5fb8ff',
    label: '处理中',
    en: 'RUNNING',
  },
  request: {
    soft: 'var(--cr-info-soft)',
    color: 'var(--cr-info-on)',
    background: '#1e3a4c',
    foreground: '#5fb8ff',
    label: '请求中',
    en: 'REQUEST',
  },
  ai: {
    soft: 'var(--cr-ai-soft)',
    color: 'var(--cr-ai-on)',
    background: '#273648',
    foreground: '#b98bff',
    label: 'AI 处理中',
    en: 'AI',
  },
}

/** 日志的 state 与岗位状态令牌对齐，避免两处各写一套颜色。 */
export const logStateTokens = {
  info: { ...jobStatusTokens.running, label: '信息', en: 'INFO' },
  success: jobStatusTokens.success,
  warning: jobStatusTokens.warn,
  danger: jobStatusTokens.error,
} as const satisfies Record<string, JobStatusToken>
