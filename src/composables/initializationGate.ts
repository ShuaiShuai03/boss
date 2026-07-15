import { ref } from 'vue'

import type { InitializationStatus } from './statisticsStore'

export function createInitializationGate(initialize: (force: boolean) => Promise<void>) {
  const initializationStatus = ref<InitializationStatus>('idle')
  const initializationError = ref<string | null>(null)
  let initializationPromise: Promise<void> | null = null

  async function ensureInitialized(force = false) {
    if (!force && initializationStatus.value === 'ready') return
    if (initializationPromise) return initializationPromise

    initializationStatus.value = 'loading'
    initializationError.value = null
    initializationPromise = initialize(force)
      .then(() => {
        initializationStatus.value = 'ready'
      })
      .catch((error) => {
        initializationStatus.value = 'error'
        initializationError.value = error instanceof Error ? error.message : String(error)
        throw error
      })
      .finally(() => {
        initializationPromise = null
      })

    return initializationPromise
  }

  return {
    initializationStatus,
    initializationError,
    ensureInitialized,
  }
}
