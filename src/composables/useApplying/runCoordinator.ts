import {
  beginWorkflowSubmission,
  completeWorkflowJob,
  confirmWorkflowSubmission,
  finishWorkflowRun,
  heartbeatWorkflowRun,
  markWorkflowJobCounted,
  releaseWorkflowRun,
  type WorkflowRunCheckpoint,
  type WorkflowRunClaim,
} from './runState'
import type { TaskResult } from './type'

export interface WorkflowRunTransport {
  readWorkflowRun(): Promise<WorkflowRunCheckpoint | null>
  claimWorkflowRun(
    claim: WorkflowRunClaim,
    now: number,
    resumePaused?: boolean,
  ): Promise<{ claimed: boolean; checkpoint: WorkflowRunCheckpoint }>
  updateWorkflowRun(
    runId: string,
    ownerId: string,
    next: WorkflowRunCheckpoint,
  ): Promise<{ updated: boolean; checkpoint: WorkflowRunCheckpoint | null }>
  pauseWorkflowRun(accountId: string, now: number): Promise<WorkflowRunCheckpoint | null>
  resetWorkflowRunFilters(accountId: string, now: number): Promise<WorkflowRunCheckpoint | null>
}

export class WorkflowLeaseLostError extends Error {
  constructor() {
    super('工作流执行租约已由其他页面接管')
    this.name = 'WorkflowLeaseLostError'
  }
}

export class WorkflowRunTransportError extends Error {
  constructor(operation: string) {
    super(`工作流恢复通信超时: ${operation}`)
    this.name = 'WorkflowRunTransportError'
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new WorkflowRunTransportError(operation)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

export class WorkflowRunCoordinator {
  checkpoint: WorkflowRunCheckpoint | null = null
  private transport: WorkflowRunTransport
  readonly claim: WorkflowRunClaim
  private now: () => number
  private operationTimeoutMs: number

  constructor(
    transport: WorkflowRunTransport,
    claim: WorkflowRunClaim,
    now: () => number = Date.now,
    operationTimeoutMs = 5_000,
  ) {
    this.transport = transport
    this.claim = claim
    this.now = now
    this.operationTimeoutMs = operationTimeoutMs
  }

  async read() {
    this.checkpoint = await withTimeout(
      this.transport.readWorkflowRun(),
      this.operationTimeoutMs,
      'read',
    )
    return this.checkpoint
  }

  async acquire(resumePaused = false) {
    const result = await withTimeout(
      this.transport.claimWorkflowRun(this.claim, this.now(), resumePaused),
      this.operationTimeoutMs,
      'claim',
    )
    this.checkpoint = result.checkpoint
    return result.claimed
  }

  private async persist(next: WorkflowRunCheckpoint | null, operation: string) {
    if (!next || !this.checkpoint) throw new WorkflowLeaseLostError()
    const result = await withTimeout(
      this.transport.updateWorkflowRun(this.checkpoint.runId, this.claim.ownerId, next),
      this.operationTimeoutMs,
      operation,
    )
    this.checkpoint = result.checkpoint
    if (!result.updated || !result.checkpoint) throw new WorkflowLeaseLostError()
    return result.checkpoint
  }

  async heartbeat(transition?: string) {
    if (!this.checkpoint) throw new WorkflowLeaseLostError()
    return this.persist(
      heartbeatWorkflowRun(this.checkpoint, this.claim.ownerId, this.now(), transition),
      'heartbeat',
    )
  }

  async pause() {
    const checkpoint = await withTimeout(
      this.transport.pauseWorkflowRun(this.claim.accountId, this.now()),
      this.operationTimeoutMs,
      'pause',
    )
    this.checkpoint = checkpoint
    return checkpoint
  }

  async release(transition: string) {
    if (!this.checkpoint) return null
    return this.persist(
      releaseWorkflowRun(this.checkpoint, this.claim.ownerId, this.now(), transition),
      'release',
    )
  }

  async resetFilters() {
    const checkpoint = await withTimeout(
      this.transport.resetWorkflowRunFilters(this.claim.accountId, this.now()),
      this.operationTimeoutMs,
      'reset_filters',
    )
    this.checkpoint = checkpoint
    return checkpoint
  }

  async countJob(jobKey: string) {
    if (!this.checkpoint) throw new WorkflowLeaseLostError()
    const result = markWorkflowJobCounted(this.checkpoint, this.claim.ownerId, jobKey, this.now())
    if (!result) throw new WorkflowLeaseLostError()
    await this.persist(result.checkpoint, 'count_job')
    return result.newlyCounted
  }

  async beginSubmission(jobKey: string) {
    if (!this.checkpoint) throw new WorkflowLeaseLostError()
    const needsReconciliation =
      this.checkpoint.submissionIntentJobKeys.includes(jobKey) &&
      !this.checkpoint.submittedJobKeys.includes(jobKey)
    await this.persist(
      beginWorkflowSubmission(this.checkpoint, this.claim.ownerId, jobKey, this.now()),
      'begin_submission',
    )
    return { needsReconciliation }
  }

  async confirmSubmission(jobKey: string) {
    if (!this.checkpoint) throw new WorkflowLeaseLostError()
    const result = confirmWorkflowSubmission(
      this.checkpoint,
      this.claim.ownerId,
      jobKey,
      this.now(),
    )
    if (!result) throw new WorkflowLeaseLostError()
    await this.persist(result.checkpoint, 'confirm_submission')
    return result.newlySubmitted
  }

  async completeJob(jobKey: string, result: TaskResult, delivered: boolean) {
    if (!this.checkpoint) throw new WorkflowLeaseLostError()
    return this.persist(
      completeWorkflowJob(
        this.checkpoint,
        this.claim.ownerId,
        jobKey,
        result,
        delivered,
        this.now(),
      ),
      'complete_job',
    )
  }

  async finish(phase: 'finished' | 'error', error?: string) {
    if (!this.checkpoint) return null
    return this.persist(
      finishWorkflowRun(this.checkpoint, this.claim.ownerId, this.now(), phase, error),
      'finish',
    )
  }

  hasCompleted(jobKey: string) {
    return this.checkpoint?.results[jobKey] != null
  }

  hasSubmitted(jobKey: string) {
    return this.checkpoint?.submittedJobKeys.includes(jobKey) === true
  }

  hasPendingSubmission(jobKey: string) {
    return (
      this.checkpoint?.submissionIntentJobKeys.includes(jobKey) === true &&
      !this.hasSubmitted(jobKey)
    )
  }
}
