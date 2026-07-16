import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import { counter } from '@/message'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import {
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextInvalidated,
} from '@/utils/extension'

import { HelperContext } from '../useHelper'
import { DependencyMissingError } from './handles'
import {
  WorkflowLeaseLostError,
  WorkflowRunCoordinator,
  WorkflowRunTransportError,
} from './runCoordinator'
import {
  workflowRunHeartbeatIntervalMs,
  workflowRunIsStale,
  type WorkflowRunCheckpoint,
} from './runState'
import { createWorkflowStopReason, type WorkflowStopReason } from './stopReason'
import {
  Handler,
  JobStatus,
  jobStatusList,
  Task,
  TaskContext,
  TaskPipeline,
  TaskResult,
  TaskStatus,
  WorkflowData,
} from './type'

export type { WorkflowStopReason, WorkflowStopReasonCode } from './stopReason'

// 全局缓存管理器实例
let cacheManager: PipelineCacheManager | null = null

/**
 * 创建缓存实例
 */
export function getCacheManager(): PipelineCacheManager {
  if (!cacheManager) {
    cacheManager = new PipelineCacheManager()
  }
  return cacheManager
}

/**
 * 缓存Pipeline处理结果
 */
export async function cachePipelineResult(
  key: string,
  jobName: string,
  brandName: string,
  status: JobStatus,
  message: string,
  processorType?: ProcessorType,
): Promise<void> {
  const cacheManager = getCacheManager()
  await cacheManager.setCacheResult(key, jobName, brandName, status, message, processorType)
}

/**
 * 检查职位是否有有效缓存
 */
export function checkJobCache(key: string): PipelineCacheItem | null {
  const cacheManager = getCacheManager()

  if (cacheManager.isValidCache(key)) {
    const cached = cacheManager.getCachedResult(key)
    return cached
  }
  return null
}

export type DeliveryWorkflow<C extends HelperContext<C, T, S>, T, S> = Awaited<
  ReturnType<typeof useDeliveryWorkflow<C, T, S>>
>

function meginResults(res: void | TaskResult | Array<TaskResult | void>): TaskResult | void {
  if (!res) return {}
  if (Array.isArray(res)) {
    if (res.length === 0) return
    return res.reduce((acc: TaskResult, r) => {
      if (!r) return acc
      let mergedStatus = acc.status
      if (r.status) {
        const accStatusIndex = jobStatusList.indexOf(acc.status as any) ?? -1
        const rStatusIndex = jobStatusList.indexOf(r.status)
        if (rStatusIndex > accStatusIndex) {
          mergedStatus = r.status
        }
      }
      return {
        isSkip: acc.isSkip || r.isSkip,
        reason: [acc.reason, r.reason].filter(Boolean).join('\n') || undefined,
        status: mergedStatus,
        msg: [acc.msg, r.msg].filter(Boolean).join('\n') || undefined,
        isCache: acc.isCache || r.isCache,
      }
    }, res[0] ?? {})
  }
  return res
}

function sanitizeLogText(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key|token|cookie|authorization)(["'\s:=]+)[^"',\s}]+/gi, '$1$2***')
}

function normalizeLogError(error: unknown) {
  if (isExtensionContextInvalidated(error)) {
    return {
      name: 'ExtensionContextInvalidated',
      message: EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
      stack: undefined,
    }
  }

  if (error instanceof Error) {
    return {
      name: sanitizeLogText(error.name),
      message: sanitizeLogText(error.message),
      stack: error.stack ? sanitizeLogText(error.stack) : undefined,
    }
  }

  return {
    message: sanitizeLogText(String(error)),
  }
}

function logStateFromStatus(status?: JobStatus) {
  if (status === 'error') return 'danger'
  if (status === 'warn') return 'warning'
  if (status === 'success') return 'success'
  return 'info'
}

class WorkflowInterruptedError extends Error {
  constructor() {
    super('工作流执行已被生命周期恢复器接管')
    this.name = 'WorkflowInterruptedError'
  }
}

function createExecutionId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function useDeliveryWorkflow<C extends HelperContext<C, T, S>, T, S>(
  items: Array<Task<C, T, S> | TaskPipeline<C, T, S> | (() => Task<C, T, S>)>,
  helper: C,
) {
  const status = ref<'pending' | 'running' | 'recovering' | 'stop' | 'error'>('pending')
  const current = ref(0)
  const total = computed(() => helper.jobList.value.length)
  const batchSubmitted = ref(0)
  const batchLimit = ref(
    helper.conf.formData.deliveryLimit.value || helper.conf.defaultFormData.deliveryLimit.value,
  )
  const errorMessage = ref<string | null>(null)
  const stopReason = shallowRef<WorkflowStopReason | null>(null)
  const recoveryMessage = ref<string | null>(null)
  const pipeline = shallowRef<Task<C, T, S>[]>([])
  const nodes = shallowRef<
    Array<{
      id: string
      label: string
      status: TaskStatus
      deps: string[]
      error?: any
    }>
  >([])
  const stateMaps = ref(new Map<string, any>())
  const resolvedHandlers = new Map<string, Handler<C, T, S>>()
  const runtimeNonce = createExecutionId()
  let runtimeId = runtimeNonce
  const runCoordinator = new WorkflowRunCoordinator(counter, {
    runId: createExecutionId(),
    ownerId: runtimeId,
    accountId: helper.uid,
    batchLimit: batchLimit.value,
  })
  let executionGeneration = 0
  let executionController: AbortController | null = null
  let executionPromise: Promise<void> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let manualPauseRequested = false

  const refreshRuntimeId = async () => {
    runtimeId = await counter.getWorkflowOwnerId(runtimeNonce)
    runCoordinator.claim.ownerId = runtimeId
  }

  const assertExecutionActive = (generation: number) => {
    if (
      generation !== executionGeneration ||
      executionController?.signal.aborted ||
      status.value === 'stop'
    ) {
      throw new WorkflowInterruptedError()
    }
  }

  const hydrateCheckpoint = (checkpoint: WorkflowRunCheckpoint | null) => {
    if (!checkpoint || checkpoint.accountId !== helper.uid) return
    batchLimit.value = checkpoint.batchLimit
    batchSubmitted.value = checkpoint.batchSubmitted
    for (const [jobKey, result] of Object.entries(checkpoint.results)) {
      helper.jobResultMaps.set(jobKey, {
        status: result.status,
        msg: result.msg,
        reason: result.reason,
      })
      const state = stateMaps.value.get(jobKey) ?? {}
      if (result.delivered || checkpoint.submittedJobKeys.includes(jobKey)) {
        state.deliverySubmitted = true
      }
      stateMaps.value.set(jobKey, state)
    }
    if (checkpoint.intent === 'paused') {
      manualPauseRequested = true
      status.value = 'stop'
      stopReason.value = createWorkflowStopReason('manual', '你可以检查当前结果后继续。')
      recoveryMessage.value = null
    }
  }

  const stopHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  const interruptExecution = () => {
    executionGeneration += 1
    executionController?.abort()
    executionController = null
    stopHeartbeat()
  }

  const startHeartbeat = (generation: number) => {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (generation !== executionGeneration || status.value !== 'running') return
      void runCoordinator.heartbeat().catch((error) => {
        logger.warn('工作流心跳失败，等待生命周期恢复', normalizeLogError(error))
        interruptExecution()
        status.value = 'recovering'
        recoveryMessage.value = '执行器通信已中断，返回页面后将自动恢复。'
      })
    }, workflowRunHeartbeatIntervalMs)
  }

  const rebuild = async () => {
    const _ctx: TaskContext<C, T, S> = { helper, now: new Date() }
    const taskMap = new Map<string, Task<C, T, S>>()
    const _resolvedHandlers = new Map<string, any>()
    const errors = new Map<string, any>()

    const rawTasks = items.flatMap((i) => {
      const item = typeof i === 'function' ? i() : i
      return (Array.isArray(item) ? item : [item]).map((task) => ({ ...task }))
    })
    const requiredIds = new Set<string>()
    for (const task of rawTasks) {
      try {
        taskMap.set(task.id, task)
        const result = await task.task(_ctx)
        if (!result) continue

        requiredIds.add(task.id)
        task.deps.forEach((d) => requiredIds.add(d))

        if (typeof result === 'function') {
          _resolvedHandlers.set(task.id, result)
        } else {
          _resolvedHandlers.set(task.id, result.fn)
          if (result.before) task.before.push(...result.before)
          if (result.after) task.after.push(...result.after)
        }
      } catch (e) {
        errors.set(task.id, e)
      }
    }

    const _pipeline: Task<C, T, S>[] = []
    const visited = new Set<string>()
    const stack = new Set<string>()
    const sort = (id: string) => {
      if (stack.has(id)) throw new Error(`Cycle: ${id}`)
      if (visited.has(id)) return
      const t = taskMap.get(id)
      if (!t || !requiredIds.has(id)) return
      stack.add(id)
      t.deps.forEach(sort)
      stack.delete(id)
      visited.add(id)
      _pipeline.push(t)
    }
    Array.from(requiredIds).forEach(sort)

    pipeline.value = _pipeline
    resolvedHandlers.clear()
    _resolvedHandlers.forEach((v, k) => resolvedHandlers.set(k, v))

    nodes.value = rawTasks.map((t) => {
      const isLastDefinition = taskMap.get(t.id)?.task === t.task
      const isResolved = _resolvedHandlers.has(t.id)
      const error = errors.get(t.id)
      let nStatus: TaskStatus = 'disabled'
      if (error) nStatus = 'failed'
      else if (!isLastDefinition) nStatus = 'shadowed'
      else if (isResolved) nStatus = 'active'
      else if (requiredIds.has(t.id)) nStatus = 'dependency_only'

      return {
        id: t.id,
        label: t.label || t.id,
        status: nStatus,
        deps: t.deps,
        error,
      }
    })
  }

  const executeTask = async (task: Task<C, T, S>, data: WorkflowData<T, S>, generation: number) => {
    let res: TaskResult | void = undefined
    const isStop = () => status.value === 'stop'
    const handler = resolvedHandlers.get(task.id)
    if (!handler || isStop()) return

    const fns = [...task.before, handler, ...task.after]
    for (const fn of fns) {
      try {
        assertExecutionActive(generation)
        res = meginResults(
          await fn(
            {
              helper,
              now: new Date(),
              signal: executionController?.signal,
              ensureActive: () => assertExecutionActive(generation),
            },
            data,
          ),
        )
        assertExecutionActive(generation)
        if (res?.isSkip || isStop()) break
      } catch (e) {
        if (e instanceof DependencyMissingError) {
          const dep = resolvedHandlers.get(e.taskId)
          if (dep) {
            await dep(
              {
                helper,
                now: new Date(),
                signal: executionController?.signal,
                ensureActive: () => assertExecutionActive(generation),
              },
              data,
            )
            res = meginResults(
              await fn(
                {
                  helper,
                  now: new Date(),
                  signal: executionController?.signal,
                  ensureActive: () => assertExecutionActive(generation),
                },
                data,
              ),
            )
            assertExecutionActive(generation)
            if (res?.isSkip || isStop()) break
            continue
          }
        }
        throw e
      }
    }
    return res
  }

  const execute = async (data: WorkflowData<T, S>, generation: number) => {
    const isStop = () => status.value === 'stop'
    let delivered = false
    try {
      let skipPipeline = false
      for (const t of pipeline.value) {
        let res: void | TaskResult = undefined
        try {
          if (isStop()) break
          helper.jobResultMaps.set(data.jobData.key, {
            status: t.state || 'running',
            msg: t.stateMsg || '运行中',
          })
          res = await executeTask(t, data, generation)
          if (res != null) {
            res.msg ??= t.label ?? t.id
            res.status ??= res.isSkip ? 'warn' : undefined
            if (res.isSkip) {
              skipPipeline = true
              break
            }
          }
          if (isStop()) break
        } catch (e) {
          if (e instanceof WorkflowInterruptedError || e instanceof WorkflowLeaseLostError) {
            throw e
          }
          if (generation !== executionGeneration || executionController?.signal.aborted) {
            throw new WorkflowInterruptedError()
          }
          const error = normalizeLogError(e)
          const shouldStopWorkflow = isExtensionContextInvalidated(e)
          ;(data.state as any).error = error
          res = {
            isSkip: true,
            status: 'error',
            reason: `任务${t.label ?? t.id}执行失败: ${error.message}`,
            msg: `报错/${t.label ?? t.id}`,
          }
          logger.error(`任务${t.label ?? t.id}执行失败`, e)
          if (shouldStopWorkflow) {
            status.value = 'stop'
            errorMessage.value = EXTENSION_CONTEXT_INVALIDATED_MESSAGE
          }
          skipPipeline = true
          break
        } finally {
          if (res != null) {
            helper.jobResultMaps.set(data.jobData.key, {
              ...(helper.jobResultMaps.get(data.jobData.key) ?? {}),
              ...res,
            })
            if (res.status) {
              helper.statistics.todayData.tasks[t.id] ??= {}
              helper.statistics.todayData.tasks[t.id][res.status] ??= 0
              helper.statistics.todayData.tasks[t.id][res.status] += 1
            }
            if (t.id === '岗位投递' && res.status === 'success') {
              if ((data.state as any).deliveryNewlySubmitted !== false) {
                helper.statistics.todayData.success += 1
              }
              delivered = true
              ;(data.state as any).deliverySubmitted = true
            }
          }
        }
      }
      if (!skipPipeline) {
        helper.jobResultMaps.set(data.jobData.key, {
          status: 'success',
          msg: '投递成功',
        })
      }
      const finalResult = helper.jobResultMaps.get(data.jobData.key)
      if (finalResult) {
        helper.logs.value.push({
          job: data.jobData,
          time: new Date().toLocaleString(),
          title: data.jobData.jobName,
          state: logStateFromStatus(finalResult.status),
          state_name: finalResult.msg ?? finalResult.reason ?? '任务结束',
          message: finalResult.reason ?? finalResult.msg,
          data: {
            jobData: data.jobData,
            ...data.state,
            state: finalResult.status,
            err: finalResult.status === 'error' ? finalResult.reason : undefined,
            summary: finalResult.reason ?? finalResult.msg,
          },
        })
      }
      return { delivered }
    } catch (e) {
      if (e instanceof WorkflowInterruptedError || e instanceof WorkflowLeaseLostError) throw e
      status.value = 'error'
      throw e
    }
  }

  const runExecution = async (rawDataMap: Map<string, T>, generation: number) => {
    await rebuild()
    assertExecutionActive(generation)

    let stepMsg = ''
    let consecutiveFailures = 0
    errorMessage.value = null
    stopReason.value = null
    recoveryMessage.value = null
    status.value = 'running'
    batchSubmitted.value = runCoordinator.checkpoint?.batchSubmitted ?? 0
    batchLimit.value =
      runCoordinator.checkpoint?.batchLimit ??
      (helper.conf.formData.deliveryLimit.value || helper.conf.defaultFormData.deliveryLimit.value)
    const isStop = () => status.value === 'stop'
    const actionDelaySeconds = () =>
      Math.max(1, Math.ceil((helper.conf.formData.actionDelayMs.value || 0) / 1000))
    const maxConsecutiveFailures = () =>
      Math.max(1, helper.conf.formData.maxConsecutiveFailures.value || 1)
    const batchIsFull = () => batchSubmitted.value >= batchLimit.value
    let pageCount = 0

    helper.logs.info('批次开始', `本批目标 ${batchLimit.value} 个岗位`)

    let recoverableInterruption = false
    try {
      while (status.value === 'running') {
        assertExecutionActive(generation)
        pageCount += 1
        helper.logs.info(
          '页面开始',
          `开始处理第 ${pageCount} 页，共 ${helper.jobList.value.length} 个岗位`,
        )
        if (helper.jobList.value.length === 0) {
          stepMsg = '没有职位可投递'
          stopReason.value = createWorkflowStopReason('no_jobs', stepMsg)
          helper.logs.info('停止原因', stepMsg)
          break
        }
        helper.jobList.value.forEach((job) => {
          const v = helper.jobResultMaps.get(job.key)
          if (!v) {
            helper.jobResultMaps.set(job.key, { status: 'wait', msg: '等待中' })
            return
          } else if (v.status === 'success' || v.status === 'warn') {
            return
          }
          v.status = 'wait'
          v.msg = '等待中'
          helper.jobResultMaps.set(job.key, v)
        })

        await delay(helper.conf.formData.delay.deliveryStarts, isStop, executionController?.signal)
        assertExecutionActive(generation)

        for (const [index, jobData] of helper.jobList.value.entries()) {
          current.value = index + 1
          assertExecutionActive(generation)
          if (isStop()) break
          if (batchIsFull()) {
            status.value = 'stop'
            stepMsg = `本批已完成 ${batchSubmitted.value}/${batchLimit.value}，点击继续开始下一批`
            stopReason.value = createWorkflowStopReason('batch_limit', stepMsg)
            helper.logs.info('本批完成', stepMsg)
            break
          }
          const jobStatus = helper.jobResultMaps.get(jobData.key)?.status
          const state = stateMaps.value.get(jobData.key) || {}
          if (
            runCoordinator.hasCompleted(jobData.key) ||
            jobStatus === 'success' ||
            jobStatus === 'warn'
          ) {
            continue
          }
          const newlyCounted = await runCoordinator.countJob(jobData.key)
          assertExecutionActive(generation)
          if (newlyCounted) helper.statistics.todayData.total += 1
          stateMaps.value.set(jobData.key, state)
          const data = {
            jobData,
            rawData: rawDataMap.get(jobData.key)!,
            state,
          }
          helper.jobMaps.set(jobData.key, data)
          helper.currentJob.value = jobData.key
          const executeResult = await execute(data, generation)
          assertExecutionActive(generation)
          batchSubmitted.value = runCoordinator.checkpoint?.batchSubmitted ?? batchSubmitted.value
          if (isStop() && errorMessage.value) {
            stepMsg = errorMessage.value
            const contextInvalidated =
              errorMessage.value === EXTENSION_CONTEXT_INVALIDATED_MESSAGE ||
              isExtensionContextInvalidated(errorMessage.value)
            stopReason.value = createWorkflowStopReason(
              contextInvalidated ? 'context_invalidated' : 'unexpected_error',
              stepMsg,
              contextInvalidated ? undefined : '工作流已因错误暂停',
            )
            helper.logs.info('停止原因', stepMsg)
            break
          }
          const result = helper.jobResultMaps.get(jobData.key)
          if (result && (result.status === 'success' || result.status === 'warn')) {
            await runCoordinator.completeJob(jobData.key, result, executeResult?.delivered === true)
            assertExecutionActive(generation)
          }
          if (result?.status === 'error') {
            consecutiveFailures += 1
            if (consecutiveFailures >= maxConsecutiveFailures()) {
              status.value = 'stop'
              stepMsg = `连续失败 ${consecutiveFailures} 次，已自动暂停`
              stopReason.value = createWorkflowStopReason('consecutive_failures', stepMsg)
              helper.logs.info('连续失败暂停', stepMsg)
              break
            }
          } else {
            consecutiveFailures = 0
          }
          if (batchIsFull()) {
            status.value = 'stop'
            stepMsg = `本批已完成 ${batchSubmitted.value}/${batchLimit.value}，点击继续开始下一批`
            stopReason.value = createWorkflowStopReason('batch_limit', stepMsg)
            helper.logs.info('本批完成', stepMsg)
            break
          }
          await delay(actionDelaySeconds(), isStop, executionController?.signal)
          assertExecutionActive(generation)
        }
        if (isStop()) break
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delay.deliveryPageNext, isStop, executionController?.signal),
        )
        assertExecutionActive(generation)
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          stopReason.value = createWorkflowStopReason('no_more_jobs', stepMsg)
          helper.logs.info('无更多岗位', stepMsg)
          break
        }
        helper.logs.info('翻页成功', `已进入下一页，当前岗位数 ${helper.jobList.value.length}`)
      }
    } catch (e) {
      if (
        e instanceof WorkflowInterruptedError ||
        e instanceof WorkflowLeaseLostError ||
        e instanceof WorkflowRunTransportError
      ) {
        recoverableInterruption = true
        if (status.value !== 'stop') {
          status.value = 'recovering'
          recoveryMessage.value = '执行器已失去活动租约，正在等待安全恢复。'
        }
        logger.warn('工作流执行已中断', normalizeLogError(e))
        return
      }
      logger.error(e)
      const error = normalizeLogError(e)
      stepMsg = `未知错误: ${error.message}`
      stopReason.value = createWorkflowStopReason(
        isExtensionContextInvalidated(e) ? 'context_invalidated' : 'unexpected_error',
        stepMsg,
      )
      helper.logs.value.push({
        time: new Date().toLocaleString(),
        title: '工作流错误',
        state: 'danger',
        state_name: '未知错误',
        message: stepMsg,
        data: {
          err: error.message,
          error,
        },
      })
    } finally {
      if (!recoverableInterruption) {
        if (!stepMsg) {
          stepMsg = status.value === 'stop' ? (errorMessage.value ?? '已暂停') : '投递结束'
          if (status.value === 'stop' && !stopReason.value) {
            stopReason.value = createWorkflowStopReason('manual', stepMsg)
          }
          if (status.value !== 'stop') {
            status.value = 'pending'
          }
        } else if (status.value !== 'stop') {
          status.value = 'error'
          errorMessage.value = stepMsg
        }
        if (runCoordinator.checkpoint?.ownerId === runtimeId) {
          await runCoordinator
            .finish(
              status.value === 'error' ? 'error' : 'finished',
              errorMessage.value ?? undefined,
            )
            .catch((error) => logger.warn('保存工作流结束状态失败', normalizeLogError(error)))
        }
        void helper.notification(stepMsg)
      }
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>, userInitiated = true) => {
    if (executionPromise) return executionPromise
    if (!userInitiated && manualPauseRequested) return
    if (userInitiated) manualPauseRequested = false
    try {
      await refreshRuntimeId()
      const existing = await runCoordinator.read()
      hydrateCheckpoint(existing)
      if (existing?.intent === 'finished' || existing?.accountId !== helper.uid) {
        runCoordinator.claim.runId = createExecutionId()
      }
      runCoordinator.claim.batchLimit =
        helper.conf.formData.deliveryLimit.value || helper.conf.defaultFormData.deliveryLimit.value
      const acquired = await runCoordinator.acquire(userInitiated)
      hydrateCheckpoint(runCoordinator.checkpoint)
      if (userInitiated) manualPauseRequested = false
      if (!acquired) {
        if (runCoordinator.checkpoint?.intent !== 'paused') {
          status.value = 'recovering'
          recoveryMessage.value = '检测到另一个活动执行器，正在等待其租约更新。'
        }
        return
      }
    } catch (error) {
      status.value = 'recovering'
      recoveryMessage.value = '暂时无法连接扩展恢复服务，返回页面后将重试。'
      logger.warn('认领工作流执行租约失败', normalizeLogError(error))
      return
    }

    executionGeneration += 1
    const generation = executionGeneration
    executionController = new AbortController()
    startHeartbeat(generation)
    const promise = runExecution(rawDataMap, generation).finally(() => {
      stopHeartbeat()
      if (executionPromise === promise) executionPromise = null
      if (executionController?.signal.aborted || generation === executionGeneration) {
        executionController = null
      }
    })
    executionPromise = promise
    return promise
  }

  const reconcile = async (rawDataMap: Map<string, T>, trigger = 'lifecycle') => {
    try {
      await refreshRuntimeId()
      const checkpoint = await runCoordinator.read()
      hydrateCheckpoint(checkpoint)
      if (manualPauseRequested) {
        if (checkpoint?.intent === 'running') await runCoordinator.pause()
        status.value = 'stop'
        recoveryMessage.value = null
        return
      }
      if (!checkpoint || checkpoint.accountId !== helper.uid || checkpoint.intent === 'finished') {
        if (status.value === 'recovering') status.value = 'pending'
        recoveryMessage.value = null
        return
      }
      if (checkpoint.intent === 'paused') {
        interruptExecution()
        status.value = 'stop'
        recoveryMessage.value = null
        return
      }

      const ownsLease = checkpoint.ownerId === runtimeId
      const stale = workflowRunIsStale(checkpoint, Date.now())
      if (executionPromise && ownsLease && !stale) {
        await runCoordinator.heartbeat(`reconcile_${trigger}`)
        return
      }

      if (executionPromise) {
        interruptExecution()
        executionPromise = null
      }
      if (ownsLease) {
        await runCoordinator.release(`stale_${trigger}`).catch(() => undefined)
      }
      status.value = 'recovering'
      recoveryMessage.value = '检测到陈旧或中断的执行器，正在安全恢复。'
      helper.logs.info('生命周期恢复', `触发来源: ${trigger}`)
      await executeAll(rawDataMap, false)
    } catch (error) {
      status.value = 'recovering'
      recoveryMessage.value = '恢复检查暂时失败，将在下一次页面唤醒时重试。'
      logger.warn('工作流恢复检查失败', normalizeLogError(error))
    }
  }

  const suspendForLifecycle = async (trigger = 'page_lifecycle') => {
    if (runCoordinator.checkpoint?.intent !== 'running') return
    interruptExecution()
    executionPromise = null
    status.value = 'recovering'
    recoveryMessage.value = '页面生命周期已变化，等待重新挂载后恢复。'
    helper.logs.info('执行器挂起', `触发来源: ${trigger}`)
    await runCoordinator
      .release(trigger)
      .catch((error) => logger.warn('释放工作流租约失败', normalizeLogError(error)))
  }

  const stop = () => {
    manualPauseRequested = true
    interruptExecution()
    executionPromise = null
    status.value = 'stop'
    recoveryMessage.value = null
    stopReason.value = createWorkflowStopReason('manual', '你可以检查当前结果后继续。')
    void runCoordinator
      .pause()
      .catch((error) => logger.warn('保存手动暂停状态失败', normalizeLogError(error)))
  }
  const reset = () => {
    status.value = 'pending'
    stopReason.value = null
    errorMessage.value = null
    recoveryMessage.value = null
    helper.jobList.value.forEach((job) => {
      const v = helper.jobResultMaps.get(job.key)
      if (!v || v.status === 'success') {
        return
      }
      v.msg = '等待中'
      v.status = 'wait'
    })
    void runCoordinator
      .resetFilters()
      .then((checkpoint) => hydrateCheckpoint(checkpoint))
      .catch((error) => logger.warn('保存筛选重置状态失败', normalizeLogError(error)))
  }

  return {
    items,
    status,
    current,
    total,
    batchSubmitted,
    batchLimit,
    errorMessage,
    stopReason,
    recoveryMessage,
    pipeline,
    nodes,
    ctx: helper,
    stateMaps,
    rebuild,
    execute,
    executeAll,
    reconcile,
    suspendForLifecycle,
    beginSubmission: (jobKey: string) => runCoordinator.beginSubmission(jobKey),
    confirmSubmission: (jobKey: string) => runCoordinator.confirmSubmission(jobKey),
    submissionConfirmed: (jobKey: string) => runCoordinator.hasSubmitted(jobKey),
    submissionPending: (jobKey: string) => runCoordinator.hasPendingSubmission(jobKey),
    stop,
    reset,
  }
}
