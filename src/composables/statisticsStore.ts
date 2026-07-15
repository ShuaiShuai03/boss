import { reactive, ref, watch } from 'vue'

import type { Statistics } from '../types/formData'

export type StatisticsSnapshot = Statistics

export interface StatisticsStorage {
  storageGet<T>(key: string, defaultValue: T): Promise<T>
  storageSet<T>(key: string, value: T): Promise<unknown>
}

export type InitializationStatus = 'idle' | 'loading' | 'ready' | 'error'

export const todayKey = 'local:web-geek-job-Today'
export const statisticsKey = 'local:web-geek-job-Statistics'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createToday(date: string): StatisticsSnapshot {
  return {
    date,
    success: 0,
    total: 0,
    repeat: 0,
    activityFilter: 0,
    tasks: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCount(
  record: Record<string, unknown>,
  key: 'success' | 'total' | 'repeat' | 'activityFilter',
  label: string,
) {
  const value = record[key]
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}.${key} 不是有效的非负数`)
  }
  return value
}

function normalizeTasks(value: unknown, label: string) {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error(`${label}.tasks 不是有效对象`)

  const tasks: StatisticsSnapshot['tasks'] = {}
  for (const [taskId, countsValue] of Object.entries(value)) {
    if (!isRecord(countsValue)) throw new Error(`${label}.tasks.${taskId} 不是有效对象`)
    const counts: Record<string, number> = {}
    for (const [status, count] of Object.entries(countsValue)) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
        throw new Error(`${label}.tasks.${taskId}.${status} 不是有效的非负数`)
      }
      counts[status] = count
    }
    tasks[taskId] = counts
  }
  return tasks
}

function normalizeStatisticsSnapshot(value: unknown, label: string): StatisticsSnapshot {
  if (!isRecord(value)) throw new Error(`${label} 不是有效对象`)
  if (typeof value.date !== 'string' || value.date.length === 0) {
    throw new Error(`${label}.date 不是有效日期`)
  }

  return {
    date: value.date,
    success: normalizeCount(value, 'success', label),
    total: normalizeCount(value, 'total', label),
    repeat: normalizeCount(value, 'repeat', label),
    activityFilter: normalizeCount(value, 'activityFilter', label),
    tasks: normalizeTasks(value.tasks, label),
  }
}

function normalizeStatisticsHistory(value: unknown): StatisticsSnapshot[] {
  if (!Array.isArray(value)) throw new Error('历史统计不是有效数组')
  return value.map((snapshot, index) =>
    normalizeStatisticsSnapshot(snapshot, `历史统计[${index}]`),
  )
}

function replaceToday(target: StatisticsSnapshot, source: StatisticsSnapshot) {
  Object.assign(target, createToday(source.date), clone(source))
}

export function createStatisticsStore(storage: StatisticsStorage, date: string) {
  const todayData = reactive<StatisticsSnapshot>(createToday(date))
  const statisticsData = ref<StatisticsSnapshot[]>([])
  const initializationStatus = ref<InitializationStatus>('idle')
  const initializationError = ref<string | null>(null)
  const persistenceError = ref<string | null>(null)

  let initializationPromise: Promise<void> | null = null
  let persistencePromise = Promise.resolve()
  let persistenceQueued = false
  let disposed = false

  const stopPersistence = watch(
    todayData,
    () => {
      if (initializationStatus.value !== 'ready' || persistenceQueued) return
      persistenceQueued = true
      queueMicrotask(() => {
        persistenceQueued = false
        if (disposed) return
        const snapshot = clone(todayData)
        const write = persistencePromise
          .catch(() => undefined)
          .then(async () => {
            await storage.storageSet(todayKey, snapshot)
            persistenceError.value = null
          })
          .catch((error) => {
            persistenceError.value = error instanceof Error ? error.message : String(error)
            throw error
          })
        persistencePromise = write
        void write.catch(() => undefined)
      })
    },
    { deep: true, flush: 'sync' },
  )

  async function initialize(force = false) {
    if (!force && initializationStatus.value === 'ready') return
    if (initializationPromise) return initializationPromise

    const flushBeforeReload = force && initializationStatus.value === 'ready'
    initializationStatus.value = 'loading'
    initializationError.value = null
    initializationPromise = (async () => {
      try {
        if (flushBeforeReload) await flush()
        const emptyToday = createToday(date)
        const [storedTodayValue, storedHistoryValue] = await Promise.all([
          storage.storageGet<unknown>(todayKey, emptyToday),
          storage.storageGet<unknown>(statisticsKey, []),
        ])
        const storedToday = normalizeStatisticsSnapshot(storedTodayValue, '今日统计')
        const storedHistory = normalizeStatisticsHistory(storedHistoryValue)

        if (storedToday.date === date) {
          replaceToday(todayData, { ...emptyToday, ...storedToday })
          statisticsData.value = clone(storedHistory)
        } else {
          const history = [clone(storedToday), ...clone(storedHistory)]
          replaceToday(todayData, emptyToday)
          statisticsData.value = history
          await Promise.all([
            storage.storageSet(todayKey, clone(todayData)),
            storage.storageSet(statisticsKey, clone(history)),
          ])
        }
        initializationStatus.value = 'ready'
      } catch (error) {
        initializationStatus.value = 'error'
        initializationError.value = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        initializationPromise = null
      }
    })()

    return initializationPromise
  }

  async function flush() {
    await Promise.resolve()
    await persistencePromise
    if (persistenceError.value) throw new Error(persistenceError.value)
  }

  async function getStatistics() {
    await initialize()
    await flush()
    return JSON.stringify(clone({ t: todayData, s: statisticsData.value }))
  }

  async function setStatistics(data: string) {
    const parsed = JSON.parse(data) as unknown
    if (!isRecord(parsed)) throw new Error('统计导入数据不是有效对象')
    const nextToday = normalizeStatisticsSnapshot(parsed.t, '导入的今日统计')
    const nextHistory = normalizeStatisticsHistory(parsed.s)

    replaceToday(todayData, nextToday)
    statisticsData.value = clone(nextHistory)
    await Promise.all([
      storage.storageSet(todayKey, clone(todayData)),
      storage.storageSet(statisticsKey, clone(statisticsData.value)),
    ])
  }

  function dispose() {
    disposed = true
    stopPersistence()
  }

  return {
    todayData,
    statisticsData,
    initializationStatus,
    initializationError,
    persistenceError,
    initialize,
    updateStatistics: initialize,
    getStatistics,
    setStatistics,
    flush,
    dispose,
  }
}

export type StatisticsStore = ReturnType<typeof createStatisticsStore>
