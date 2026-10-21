import assert from 'node:assert/strict'
import { mock } from 'bun:test'

let releaseRead
let stored
const counter = {
  storageGet: async () => new Promise((resolve) => { releaseRead = resolve }),
  storageSet: async (_key, value) => { stored = structuredClone(value); return true },
}
globalThis.useToast = () => ({ add() {} })
mock.module('../src/message/index.ts', () => ({ counter }))
mock.module('../src/utils/logger.ts', () => ({ logger: { debug() {}, info() {}, error() {} } }))
const { PipelineCacheManager } = await import('../src/composables/usePipelineCache.ts')
const cache = new PipelineCacheManager({ storageKey: 'local:test-account-cache' })
const save = cache.setCacheResult('new', 'New job', 'Company', 'warn', 'excluded')
releaseRead({ data: {}, lastCleanup: Date.now() })
await save
assert.equal(stored.data.new.jobName, 'New job', 'write must await initialization')
await cache.clearCache()
assert.deepEqual(stored.data, {})
console.log('pipeline cache initialization/write regressions passed')
