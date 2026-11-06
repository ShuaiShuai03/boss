import { watch } from 'vue'

import { counter } from '@/message'
import { getCurDay } from '@/utils'
import { logger } from '@/utils/logger'

import { createStatisticsStore } from './statisticsStore'

export * from './statisticsStore'

const ACCOUNT_SWITCHED_MESSAGE = '账户已切换，请刷新后加载该账户统计'

export function createExtensionStatisticsStore(getAccountId: () => string) {
  let owner = ''
  function scopedKey(key: string) {
    const accountId = getAccountId()
    if (!accountId) throw new Error('统计数据需要已登录账户')
    owner ||= accountId
    // Never write counters captured under another account into the new account.
    if (owner !== accountId) throw new Error(ACCOUNT_SWITCHED_MESSAGE)
    return `${key}::account::${encodeURIComponent(accountId)}`
  }
  const store = createStatisticsStore(
    {
      storageGet: async (key, fallback) => {
        const accountId = getAccountId()
        // Before the account is known, load empty counters instead of failing the shared
        // initialization gate; the account watch below reloads once the uid resolves.
        if (!accountId) return fallback
        const value = await counter.storageGet(scopedKey(key), fallback)
        if (accountId !== getAccountId()) throw new Error(ACCOUNT_SWITCHED_MESSAGE)
        return value
      },
      storageSet: (key, value) => counter.storageSet(scopedKey(key), value),
      storageSetItems: (items) =>
        counter.storageSetItems(items.map(({ key, value }) => ({ key: scopedKey(key), value }))),
    },
    getCurDay(),
  )
  function reloadForResolvedAccount() {
    // Wait out any in-flight account-less load, then force a scoped reload.
    void store
      .initialize()
      .catch(() => undefined)
      .then(() => store.initialize(true))
      .catch((error) => logger.warn('账户统计加载失败', error))
  }
  function handleAccountChange(accountId: string) {
    if (!owner) {
      if (accountId) reloadForResolvedAccount()
      return
    }
    if (accountId === owner) return
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
    store.initializationError.value = ACCOUNT_SWITCHED_MESSAGE
  }
  // The helper context builds this store inside its base constructor, before the subclass has
  // wired the reactive user source, so the watch is created on first initialize instead.
  let stopAccountWatch: (() => void) | null = null
  function initialize(force = false) {
    stopAccountWatch ??= watch(getAccountId, handleAccountChange, { flush: 'sync' })
    return store.initialize(force)
  }
  return {
    ...store,
    initialize,
    updateStatistics: initialize,
    dispose() {
      stopAccountWatch?.()
      store.dispose()
    },
  }
}
