import { shallowRef, ref } from 'vue'

import { PipelineCacheManager } from '@/composables/usePipelineCache'
import type { PipelineCacheItem, ProcessorType } from '@/types/pipelineCache'
import {
  EXTENSION_CONTEXT_INVALIDATED_MESSAGE,
  isExtensionContextInvalidated,
} from '@/utils/extension'

import { HelperContext } from '../useHelper'
import { DependencyMissingError } from './handles'
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

export async function useDeliveryWorkflow<C extends HelperContext<C, T, S>, T, S>(
  items: Array<Task<C, T, S> | TaskPipeline<C, T, S> | (() => Task<C, T, S>)>,
  helper: C,
) {
  const status = ref<'pending' | 'running' | 'stop' | 'error'>('pending')
  const current = ref(0)
  const total = computed(() => helper.jobList.value.length)
  const batchSubmitted = ref(0)
  const batchLimit = ref(
    helper.conf.formData.deliveryLimit.value || helper.conf.defaultFormData.deliveryLimit.value,
  )
  const errorMessage = ref<string | null>(null)
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

  const executeTask = async (task: Task<C, T, S>, data: WorkflowData<T, S>) => {
    let res: TaskResult | void = undefined
    const isStop = () => status.value === 'stop'
    const handler = resolvedHandlers.get(task.id)
    if (!handler || isStop()) return

    const fns = [...task.before, handler, ...task.after]
    for (const fn of fns) {
      try {
        res = meginResults(
          await fn(
            {
              helper,
              now: new Date(),
            },
            data,
          ),
        )
        if (res?.isSkip || isStop()) break
      } catch (e) {
        if (e instanceof DependencyMissingError) {
          const dep = resolvedHandlers.get(e.taskId)
          if (dep) {
            await dep(
              {
                helper,
                now: new Date(),
              },
              data,
            )
            res = meginResults(
              await fn(
                {
                  helper,
                  now: new Date(),
                },
                data,
              ),
            )
            if (res?.isSkip || isStop()) break
            continue
          }
        }
        throw e
      }
    }
    return res
  }

  const execute = async (data: WorkflowData<T, S>) => {
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
          res = await executeTask(t, data)
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
              helper.statistics.todayData.success += 1
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
      status.value = 'error'
      throw e
    }
  }

  const executeAll = async (rawDataMap: Map<string, T>) => {
    await rebuild()

    let stepMsg = ''
    let consecutiveFailures = 0
    errorMessage.value = null
    status.value = 'running'
    batchSubmitted.value = 0
    batchLimit.value =
      helper.conf.formData.deliveryLimit.value || helper.conf.defaultFormData.deliveryLimit.value
    const isStop = () => status.value === 'stop'
    const actionDelaySeconds = () =>
      Math.max(1, Math.ceil((helper.conf.formData.actionDelayMs.value || 0) / 1000))
    const maxConsecutiveFailures = () =>
      Math.max(1, helper.conf.formData.maxConsecutiveFailures.value || 1)
    const batchIsFull = () => batchSubmitted.value >= batchLimit.value
    let pageCount = 0

    helper.logs.info('批次开始', `本批目标 ${batchLimit.value} 个岗位`)

    try {
      while (status.value === 'running') {
        pageCount += 1
        helper.logs.info(
          '页面开始',
          `开始处理第 ${pageCount} 页，共 ${helper.jobList.value.length} 个岗位`,
        )
        if (helper.jobList.value.length === 0) {
          stepMsg = '没有职位可投递'
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

        await delay(helper.conf.formData.delay.deliveryStarts, isStop)

        for (const [index, jobData] of helper.jobList.value.entries()) {
          current.value = index + 1
          if (isStop()) break
          if (batchIsFull()) {
            status.value = 'stop'
            stepMsg = `本批已完成 ${batchSubmitted.value}/${batchLimit.value}，点击继续开始下一批`
            helper.logs.info('本批完成', stepMsg)
            break
          }
          const jobStatus = helper.jobResultMaps.get(jobData.key)?.status
          const state = stateMaps.value.get(jobData.key) || {}
          if (jobStatus === 'success' || jobStatus === 'warn' || state.deliverySubmitted) {
            continue
          }
          helper.statistics.todayData.total += 1
          stateMaps.value.set(jobData.key, state)
          const data = {
            jobData,
            rawData: rawDataMap.get(jobData.key)!,
            state,
          }
          helper.jobMaps.set(jobData.key, data)
          helper.currentJob.value = jobData.key
          const executeResult = await execute(data)
          if (executeResult?.delivered) {
            batchSubmitted.value += 1
          }
          if (isStop() && errorMessage.value) {
            stepMsg = errorMessage.value
            helper.logs.info('停止原因', stepMsg)
            break
          }
          const result = helper.jobResultMaps.get(jobData.key)
          if (result?.status === 'error') {
            consecutiveFailures += 1
            if (consecutiveFailures >= maxConsecutiveFailures()) {
              status.value = 'stop'
              stepMsg = `连续失败 ${consecutiveFailures} 次，已自动暂停`
              helper.logs.info('连续失败暂停', stepMsg)
              break
            }
          } else {
            consecutiveFailures = 0
          }
          if (batchIsFull()) {
            status.value = 'stop'
            stepMsg = `本批已完成 ${batchSubmitted.value}/${batchLimit.value}，点击继续开始下一批`
            helper.logs.info('本批完成', stepMsg)
            break
          }
          await delay(actionDelaySeconds(), isStop)
        }
        if (isStop()) break
        const hasMore = await helper.loadMoreJob(
          delay(helper.conf.formData.delay.deliveryPageNext, isStop),
        )
        if (!hasMore) {
          status.value = 'stop'
          stepMsg = '投递结束, 无法继续下一页'
          helper.logs.info('无更多岗位', stepMsg)
          break
        }
        helper.logs.info('翻页成功', `已进入下一页，当前岗位数 ${helper.jobList.value.length}`)
      }
    } catch (e) {
      logger.error(e)
      const error = normalizeLogError(e)
      stepMsg = `未知错误: ${error.message}`
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
      if (!stepMsg) {
        stepMsg = status.value === 'stop' ? (errorMessage.value ?? '已暂停') : '投递结束'
        if (status.value !== 'stop') {
          status.value = 'pending'
        }
      } else if (status.value !== 'stop') {
        status.value = 'error'
        errorMessage.value = stepMsg
      }
      void helper.notification(stepMsg)
    }
  }

  const stop = () => (status.value = 'stop')
  const reset = () => {
    status.value = 'pending'
    helper.jobList.value.forEach((job) => {
      const v = helper.jobResultMaps.get(job.key)
      if (!v || v.status === 'success') {
        return
      }
      v.msg = '等待中'
      v.status = 'wait'
    })
  }

  return {
    items,
    status,
    current,
    total,
    batchSubmitted,
    batchLimit,
    errorMessage,
    pipeline,
    nodes,
    ctx: helper,
    stateMaps,
    rebuild,
    execute,
    executeAll,
    stop,
    reset,
  }
}
