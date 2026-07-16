import type { JobStatus } from '../composables/useApplying/type'

export interface JobStatusToken {
  background: string
  foreground: string
  label: string
}

export const jobStatusTokens: Record<JobStatus, JobStatusToken> = {
  pending: { background: '#4b5563', foreground: '#ffffff', label: '待处理' },
  wait: { background: '#475569', foreground: '#ffffff', label: '等待中' },
  error: { background: '#b91c1c', foreground: '#ffffff', label: '失败' },
  warn: { background: '#854d0e', foreground: '#ffffff', label: '已跳过' },
  success: { background: '#166534', foreground: '#ffffff', label: '成功' },
  running: { background: '#155e75', foreground: '#ffffff', label: '处理中' },
  request: { background: '#1d4ed8', foreground: '#ffffff', label: '请求中' },
  ai: { background: '#6b21a8', foreground: '#ffffff', label: 'AI 处理中' },
}
