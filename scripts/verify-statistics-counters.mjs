import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

// The statistics panel derives 过滤比例/重复比例/活跃比例 from todayData counters. The repeat and
// activityFilter increments were silently dropped in a refactor, pinning both ratios at 0.0%
// while the panel kept rendering them. Every counter the panel reads must have a writer.

const statisticsView = read('src/components/Tabs/Statistics.vue')
assert.match(statisticsView, /todayData\.total/, 'panel must render todayData.total')
assert.match(statisticsView, /todayData\.repeat/, 'panel must render todayData.repeat')
assert.match(
  statisticsView,
  /todayData\.activityFilter/,
  'panel must render todayData.activityFilter',
)

const workflow = read('src/composables/useApplying/index.ts')
assert.match(workflow, /todayData\.total \+= 1/, 'workflow must count scanned jobs into total')
assert.match(workflow, /todayData\.success \+= 1/, 'workflow must count deliveries into success')

const delivery = read('src/entrypoints/boss/delivery.ts')
assert.match(
  delivery,
  /todayData\.repeat \+= 1/,
  'the 已沟通 handler must count re-encountered jobs into repeat',
)

const handles = read('src/composables/useApplying/handles.ts')
assert.match(
  handles,
  /todayData\.activityFilter \+= 1/,
  'the activity filter must count inactive jobs into activityFilter',
)

console.log('statistics counters verification passed')
