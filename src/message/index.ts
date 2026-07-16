import type { StorageLikeAsync } from '@vueuse/core'
import { defineProxy } from 'comctx'

import { type ContentCounter } from './contentScript'
import { InjectContentAdapter, readInjectedContentBridgeOptions } from './contentScriptShare'

// export type * from './background'
// export type * from './contentScript'

export const [, injectCounter] = defineProxy(() => ({}) as ContentCounter, {
  namespace: '__boss-helper-content__',
})

export const counter = injectCounter(new InjectContentAdapter(readInjectedContentBridgeOptions()))

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
