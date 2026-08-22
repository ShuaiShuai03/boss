import type { StorageLikeAsync } from '@vueuse/core'

import { ContentCounter, InjectBackgroundAdapter, injectBackgroundCounter } from './contentScript'

export const counter = new ContentCounter(injectBackgroundCounter(new InjectBackgroundAdapter()))

export const ExtStorage: StorageLikeAsync = {
  async getItem(key) {
    return counter.storageGet(key)
  },
  async setItem(key, value) {
    await counter.storageSet(key, value)
  },
  async removeItem(key) {
    await counter.storageRm(key)
  },
}
