import type { JobStatus, TaskResult } from './type'

export const workflowRunRawStorageKey = 'boss-helper-workflow-run'
export const workflowRunHeartbeatIntervalMs = 30_000
export const workflowRunStaleAfterMs = 150_000
export const workflowRunProgressStaleAfterMs = 300_000

export type WorkflowRunIntent = 'running' | 'paused' | 'finished'
export type WorkflowRunPhase = 'running' | 'recovering' | 'paused' | 'finished' | 'error'

export interface PersistedJobResult {
  status: JobStatus
  msg?: string
  reason?: string
  delivered: boolean
  completedAt: number
}

export interface WorkflowRunCheckpoint {
  version: 1
  runId: string
  ownerId: string | null
  accountId: string
  intent: WorkflowRunIntent
  phase: WorkflowRunPhase
  startedAt: number
  updatedAt: number
  heartbeatAt: number
  progressAt: number
  batchLimit: number
  batchSubmitted: number
  currentJobKey: string | null
  countedJobKeys: string[]
  submissionIntentJobKeys: string[]
  submittedJobKeys: string[]
  results: Record<string, PersistedJobResult>
  lastTransition?: string
  lastError?: string
}

export interface WorkflowRunClaim {
  runId: string
  ownerId: string
  accountId: string
  batchLimit: number
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNonNegative(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function sanitizeResult(value: unknown): PersistedJobResult | null {
  if (!isRecord(value)) return null
  const allowedStatuses: JobStatus[] = [
    'pending',
    'wait',
    'running',
    'request',
    'ai',
    'success',
    'warn',
    'error',
  ]
  if (!allowedStatuses.includes(value.status as JobStatus)) return null
  return {
    status: value.status as JobStatus,
    msg: typeof value.msg === 'string' ? value.msg : undefined,
    reason: typeof value.reason === 'string' ? value.reason : undefined,
    delivered: value.delivered === true,
    completedAt: finiteNonNegative(value.completedAt),
  }
}

export function normalizeWorkflowRunCheckpoint(value: unknown): WorkflowRunCheckpoint | null {
  if (!isRecord(value) || value.version !== 1) return null
  if (
    typeof value.runId !== 'string' ||
    typeof value.accountId !== 'string' ||
    !['running', 'paused', 'finished'].includes(String(value.intent)) ||
    !['running', 'recovering', 'paused', 'finished', 'error'].includes(String(value.phase))
  ) {
    return null
  }

  const results: Record<string, PersistedJobResult> = {}
  if (isRecord(value.results)) {
    for (const [jobKey, resultValue] of Object.entries(value.results)) {
      const result = sanitizeResult(resultValue)
      if (result) results[jobKey] = result
    }
  }

  return {
    version: 1,
    runId: value.runId,
    ownerId: typeof value.ownerId === 'string' ? value.ownerId : null,
    accountId: value.accountId,
    intent: value.intent as WorkflowRunIntent,
    phase: value.phase as WorkflowRunPhase,
    startedAt: finiteNonNegative(value.startedAt),
    updatedAt: finiteNonNegative(value.updatedAt),
    heartbeatAt: finiteNonNegative(value.heartbeatAt),
    progressAt: finiteNonNegative(value.progressAt, finiteNonNegative(value.heartbeatAt)),
    batchLimit: Math.max(1, finiteNonNegative(value.batchLimit, 1)),
    batchSubmitted: finiteNonNegative(value.batchSubmitted),
    currentJobKey: typeof value.currentJobKey === 'string' ? value.currentJobKey : null,
    countedJobKeys: unique(
      Array.isArray(value.countedJobKeys)
        ? value.countedJobKeys.filter((item): item is string => typeof item === 'string')
        : [],
    ),
    submissionIntentJobKeys: unique(
      Array.isArray(value.submissionIntentJobKeys)
        ? value.submissionIntentJobKeys.filter((item): item is string => typeof item === 'string')
        : [],
    ),
    submittedJobKeys: unique(
      Array.isArray(value.submittedJobKeys)
        ? value.submittedJobKeys.filter((item): item is string => typeof item === 'string')
        : [],
    ),
    results,
    lastTransition: typeof value.lastTransition === 'string' ? value.lastTransition : undefined,
    lastError: typeof value.lastError === 'string' ? value.lastError : undefined,
  }
}

export function createWorkflowRunCheckpoint(
  claim: WorkflowRunClaim,
  now: number,
): WorkflowRunCheckpoint {
  return {
    version: 1,
    runId: claim.runId,
    ownerId: claim.ownerId,
    accountId: claim.accountId,
    intent: 'running',
    phase: 'running',
    startedAt: now,
    updatedAt: now,
    heartbeatAt: now,
    progressAt: now,
    batchLimit: Math.max(1, claim.batchLimit),
    batchSubmitted: 0,
    currentJobKey: null,
    countedJobKeys: [],
    submissionIntentJobKeys: [],
    submittedJobKeys: [],
    results: {},
    lastTransition: 'run_started',
  }
}

export function workflowRunIsStale(
  checkpoint: WorkflowRunCheckpoint,
  now: number,
  staleAfterMs = workflowRunStaleAfterMs,
) {
  return (
    now - checkpoint.heartbeatAt > staleAfterMs ||
    now - checkpoint.progressAt > workflowRunProgressStaleAfterMs
  )
}

function workflowRunOwnerTabId(ownerId: string | null) {
  return ownerId?.match(/^tab:(\d+):runtime:/)?.[1] ?? null
}

export function claimWorkflowRun(
  currentValue: unknown,
  claim: WorkflowRunClaim,
  now: number,
  staleAfterMs = workflowRunStaleAfterMs,
): { claimed: boolean; checkpoint: WorkflowRunCheckpoint } {
  const current = normalizeWorkflowRunCheckpoint(currentValue)
  if (!current || current.accountId !== claim.accountId) {
    return { claimed: true, checkpoint: createWorkflowRunCheckpoint(claim, now) }
  }

  if (current.intent === 'finished') {
    return {
      claimed: true,
      checkpoint: {
        ...createWorkflowRunCheckpoint(claim, now),
        countedJobKeys: [...current.countedJobKeys],
        submissionIntentJobKeys: [...current.submissionIntentJobKeys],
        submittedJobKeys: [...current.submittedJobKeys],
        results: { ...current.results },
        lastTransition: 'next_batch_started',
      },
    }
  }

  if (current.intent === 'paused') {
    return { claimed: false, checkpoint: current }
  }

  const sameOwner = current.ownerId === claim.ownerId
  const currentOwnerTabId = workflowRunOwnerTabId(current.ownerId)
  const claimOwnerTabId = workflowRunOwnerTabId(claim.ownerId)
  const sameOwnerTab = currentOwnerTabId !== null && currentOwnerTabId === claimOwnerTabId
  const canTakeOwnership =
    sameOwner ||
    current.ownerId === null ||
    sameOwnerTab ||
    workflowRunIsStale(current, now, staleAfterMs)
  if (!canTakeOwnership) return { claimed: false, checkpoint: current }

  return {
    claimed: true,
    checkpoint: {
      ...current,
      ownerId: claim.ownerId,
      intent: 'running',
      phase: sameOwner ? 'running' : 'recovering',
      updatedAt: now,
      heartbeatAt: now,
      progressAt: sameOwner ? current.progressAt : now,
      lastTransition: sameOwner
        ? 'lease_refreshed'
        : sameOwnerTab
          ? 'tab_runtime_recovered'
          : 'stale_run_recovered',
    },
  }
}

export function resumePausedWorkflowRun(
  currentValue: unknown,
  claim: WorkflowRunClaim,
  now: number,
): WorkflowRunCheckpoint {
  const current = normalizeWorkflowRunCheckpoint(currentValue)
  if (!current || current.accountId !== claim.accountId || current.intent === 'finished') {
    return createWorkflowRunCheckpoint(claim, now)
  }
  return {
    ...current,
    ownerId: claim.ownerId,
    intent: 'running',
    phase: 'recovering',
    updatedAt: now,
    heartbeatAt: now,
    progressAt: now,
    lastTransition: 'manual_resume',
    lastError: undefined,
  }
}

export function heartbeatWorkflowRun(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  now: number,
  transition = 'heartbeat',
): WorkflowRunCheckpoint | null {
  if (checkpoint.ownerId !== ownerId || checkpoint.intent !== 'running') return null
  return {
    ...checkpoint,
    phase: 'running',
    updatedAt: now,
    heartbeatAt: now,
    progressAt:
      transition === 'heartbeat' || transition.startsWith('reconcile_')
        ? checkpoint.progressAt
        : now,
    lastTransition: transition,
  }
}

export function pauseWorkflowRun(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  now: number,
): WorkflowRunCheckpoint | null {
  if (checkpoint.ownerId !== ownerId) return null
  return {
    ...checkpoint,
    ownerId: null,
    intent: 'paused',
    phase: 'paused',
    updatedAt: now,
    heartbeatAt: now,
    progressAt: now,
    lastTransition: 'manual_pause',
  }
}

export function forcePauseWorkflowRun(
  currentValue: unknown,
  accountId: string,
  now: number,
): WorkflowRunCheckpoint | null {
  const current = normalizeWorkflowRunCheckpoint(currentValue)
  if (!current || current.accountId !== accountId || current.intent === 'finished') return current
  return {
    ...current,
    ownerId: null,
    intent: 'paused',
    phase: 'paused',
    updatedAt: now,
    heartbeatAt: now,
    progressAt: now,
    lastTransition: 'manual_pause',
  }
}

export function resetWorkflowRunFilters(
  currentValue: unknown,
  accountId: string,
  now: number,
): WorkflowRunCheckpoint | null {
  const current = normalizeWorkflowRunCheckpoint(currentValue)
  if (!current || current.accountId !== accountId) return current
  const results = Object.fromEntries(
    Object.entries(current.results).filter(([, result]) => result.delivered),
  )
  return {
    ...current,
    countedJobKeys: current.countedJobKeys.filter((key) => current.submittedJobKeys.includes(key)),
    results,
    updatedAt: now,
    lastTransition: 'filters_reset',
  }
}

export function releaseWorkflowRun(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  now: number,
  transition: string,
): WorkflowRunCheckpoint | null {
  if (checkpoint.ownerId !== ownerId || checkpoint.intent !== 'running') return null
  return {
    ...checkpoint,
    ownerId: null,
    phase: 'recovering',
    updatedAt: now,
    lastTransition: transition,
  }
}

export function beginWorkflowSubmission(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  jobKey: string,
  now: number,
): WorkflowRunCheckpoint | null {
  const next = heartbeatWorkflowRun(checkpoint, ownerId, now, 'submission_intent')
  if (!next) return null
  next.currentJobKey = jobKey
  next.submissionIntentJobKeys = unique([...next.submissionIntentJobKeys, jobKey])
  return next
}

export function confirmWorkflowSubmission(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  jobKey: string,
  now: number,
): { checkpoint: WorkflowRunCheckpoint; newlySubmitted: boolean } | null {
  const next = heartbeatWorkflowRun(checkpoint, ownerId, now, 'submission_confirmed')
  if (!next) return null
  const newlySubmitted = !next.submittedJobKeys.includes(jobKey)
  next.submissionIntentJobKeys = next.submissionIntentJobKeys.filter((key) => key !== jobKey)
  next.submittedJobKeys = unique([...next.submittedJobKeys, jobKey])
  if (newlySubmitted) next.batchSubmitted += 1
  return { checkpoint: next, newlySubmitted }
}

export function completeWorkflowJob(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  jobKey: string,
  result: TaskResult,
  delivered: boolean,
  now: number,
): WorkflowRunCheckpoint | null {
  const next = heartbeatWorkflowRun(checkpoint, ownerId, now, 'job_completed')
  if (!next) return null
  next.currentJobKey = null
  next.results = {
    ...next.results,
    [jobKey]: {
      status: result.status ?? (delivered ? 'success' : 'warn'),
      msg: result.msg,
      reason: result.reason,
      delivered,
      completedAt: now,
    },
  }
  return next
}

export function markWorkflowJobCounted(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  jobKey: string,
  now: number,
): { checkpoint: WorkflowRunCheckpoint; newlyCounted: boolean } | null {
  const next = heartbeatWorkflowRun(checkpoint, ownerId, now, 'job_counted')
  if (!next) return null
  const newlyCounted = !next.countedJobKeys.includes(jobKey)
  next.countedJobKeys = unique([...next.countedJobKeys, jobKey])
  return { checkpoint: next, newlyCounted }
}

export function finishWorkflowRun(
  checkpoint: WorkflowRunCheckpoint,
  ownerId: string,
  now: number,
  phase: Extract<WorkflowRunPhase, 'finished' | 'error'>,
  lastError?: string,
): WorkflowRunCheckpoint | null {
  if (checkpoint.ownerId !== ownerId) return null
  return {
    ...checkpoint,
    ownerId: null,
    intent: 'finished',
    phase,
    updatedAt: now,
    heartbeatAt: now,
    progressAt: now,
    currentJobKey: null,
    lastTransition: phase === 'finished' ? 'run_finished' : 'run_failed',
    lastError,
  }
}
