import assert from 'node:assert/strict'

import {
  evaluateKeywordFilter,
  jobContentKeywordMatcher,
  normalizeFilterKeywords,
} from '../src/composables/useApplying/utils.ts'

assert.deepEqual(normalizeFilterKeywords([' AI ', '', '  Agent工程师  ']), ['AI', 'Agent工程师'])

assert.deepEqual(evaluateKeywordFilter('AI 应用开发工程师', [' ai '], false), {
  action: 'skip',
  keyword: 'ai',
})
assert.deepEqual(evaluateKeywordFilter('AI 应用开发工程师', ['agent'], false), {
  action: 'pass',
})
assert.deepEqual(evaluateKeywordFilter('AI 应用开发工程师', ['AI'], true), {
  action: 'pass',
  keyword: 'AI',
})
assert.deepEqual(evaluateKeywordFilter('销售顾问', ['AI'], true), {
  action: 'skip',
})
assert.deepEqual(evaluateKeywordFilter('销售顾问', [], true), {
  action: 'skip',
})
assert.deepEqual(evaluateKeywordFilter('销售顾问', [], false), {
  action: 'pass',
})

assert.equal(jobContentKeywordMatcher('需要外包驻场开发经验', '外包'), true)
assert.equal(jobContentKeywordMatcher('不是外包岗位，研发自有产品', '外包'), false)
assert.equal(jobContentKeywordMatcher('负责销售系统研发', '销售'), false)
assert.equal(jobContentKeywordMatcher('熟悉 C++ 和 Python', 'c++'), true)

assert.deepEqual(
  evaluateKeywordFilter('熟悉 C++ 和 Python', [' c++ '], false, jobContentKeywordMatcher),
  {
    action: 'skip',
    keyword: 'c++',
  },
)

console.log('filter rules verification passed')
