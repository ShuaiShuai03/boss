import { watch } from 'vue'

import { counter } from '@/message'
import { getCurDay } from '@/utils'

import { createStatisticsStore } from './statisticsStore'

export * from './statisticsStore'

export function createExtensionStatisticsStore(getAccountId: () => string) {
  let owner = ''
  function scopedKey(key: string) {
    const accountId = getAccountId()
    if (!accountId) throw new Error('统计数据需要已登录账户')
    owner ||= accountId
    // Never write counters captured under another account into the new account.
    if (owner !== accountId) throw new Error('账户已切换，请刷新后加载该账户统计')
    return `${key}::account::${encodeURIComponent(accountId)}`
  }
  const store = createStatisticsStore(
    {
      storageGet: async (key, fallback) => {
        const accountId = getAccountId()
        const value = await counter.storageGet(scopedKey(key), fallback)
        if (accountId !== getAccountId()) throw new Error('账户已切换，请刷新后加载该账户统计')
        return value
      },
      storageSet: (key, value) => counter.storageSet(scopedKey(key), value),
      storageSetItems: (items) =>
        counter.storageSetItems(items.map(({ key, value }) => ({ key: scopedKey(key), value }))),
    },
    getCurDay(),
  )
  const stopAccountWatch = watch(
    getAccountId,
    (accountId) => {
      if (!owner || accountId === owner) return
      Object.assign(store.todayData, {
        date: getCurDay(),
        total: 0,
        success: 0,
        repeat: 0,
        activityFilter: 0,
        tasks: {},
      })
      store.statisticsData.value = []
      store.initializationStatus.value = 'error'
      store.initializationError.value = '账户已切换，请刷新后加载该账户统计'
    },
    { flush: 'sync' },
  )
  return {
    ...store,
    dispose() {
      stopAccountWatch()
      store.dispose()
    },
  }
}
