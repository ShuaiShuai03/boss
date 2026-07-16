export type WorkflowStopReasonCode =
  | 'manual'
  | 'batch_limit'
  | 'consecutive_failures'
  | 'no_jobs'
  | 'no_more_jobs'
  | 'context_invalidated'
  | 'unexpected_error'

export interface WorkflowStopReason {
  code: WorkflowStopReasonCode
  title: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

const stopReasonMeta: Record<
  WorkflowStopReasonCode,
  Pick<WorkflowStopReason, 'title' | 'severity'>
> = {
  manual: { title: '已手动暂停', severity: 'info' },
  batch_limit: { title: '本批已完成', severity: 'info' },
  consecutive_failures: { title: '连续失败，已自动暂停', severity: 'error' },
  no_jobs: { title: '当前页面没有可处理岗位', severity: 'warning' },
  no_more_jobs: { title: '没有更多岗位', severity: 'info' },
  context_invalidated: { title: '扩展已更新，需要刷新页面', severity: 'error' },
  unexpected_error: { title: '工作流发生错误', severity: 'error' },
}

export function createWorkflowStopReason(
  code: WorkflowStopReasonCode,
  message: string,
  title = stopReasonMeta[code].title,
): WorkflowStopReason {
  return {
    code,
    title,
    message,
    severity: stopReasonMeta[code].severity,
  }
}
