import { counter } from '@/message'
import { getCurDay } from '@/utils'
import { createStatisticsStore } from './statisticsStore'

export * from './statisticsStore'

export function createExtensionStatisticsStore() {
  return createStatisticsStore(counter, getCurDay())
}
