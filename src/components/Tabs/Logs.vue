<script lang="ts" setup>
import { computed, ref } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { logStateTokens } from '@/components/jobStatusTokens'
import type { Log } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'

type LogState = Log['state']
type FilterValue = 'all' | LogState

const helper = useHelper()
const filter = ref<FilterValue>('all')
const openRow = ref<number | null>(null)

const filters: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'warning', label: '已跳过' },
  { value: 'danger', label: '失败' },
  { value: 'info', label: '信息' },
]

function token(state: LogState) {
  return logStateTokens[state] ?? logStateTokens.info
}

function count(value: FilterValue) {
  return value === 'all'
    ? helper.logs.value.length
    : helper.logs.value.filter((item) => item.state === value).length
}

/** 保留原始下标做行标识，翻转只影响展示顺序（最新在最上面）。 */
const rows = computed(() =>
  helper.logs.value
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => filter.value === 'all' || log.state === filter.value)
    .reverse(),
)

function toggleRow(index: number) {
  openRow.value = openRow.value === index ? null : index
}

function formatJson(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}
</script>

<template>
  <div class="logs">
    <header class="logs-head">
      <h2 class="logs-title">日志</h2>
      <span class="logs-count">共 {{ helper.logs.value.length }} 条</span>
      <div class="logs-filters">
        <button
          v-for="item in filters"
          :key="item.value"
          type="button"
          class="cr-seg logs-filter"
          :data-active="filter === item.value"
          :aria-pressed="filter === item.value"
          @click="filter = item.value"
        >
          {{ item.label }}
          <span class="logs-filter-count">{{ count(item.value) }}</span>
        </button>
      </div>
      <UButton
        class="logs-clear"
        color="error"
        variant="outline"
        size="xs"
        :disabled="helper.logs.value.length === 0"
        @click="helper.logs.clear()"
      >
        清空日志
      </UButton>
    </header>

    <div class="logs-table">
      <div class="logs-table-head" aria-hidden="true">
        <span>时间</span>
        <span>对象 / 岗位</span>
        <span>结果</span>
        <span>原因 / 摘要</span>
        <span />
      </div>

      <p v-if="!rows.length" class="logs-empty">
        暂无日志。开始投递后会显示批次、翻页、岗位处理和错误详情。
      </p>

      <div v-for="row in rows" :key="row.index">
        <button
          type="button"
          class="cr-row cr-b logs-row"
          :data-open="openRow === row.index"
          :aria-expanded="openRow === row.index"
          :aria-controls="`boss-helper-log-${row.index}`"
          @click="toggleRow(row.index)"
        >
          <span class="logs-time">{{ row.log.time ?? '-' }}</span>
          <span class="logs-row-title">{{ row.log.title }}</span>
          <span
            class="logs-state"
            :style="{ background: token(row.log.state).soft, color: token(row.log.state).color }"
          >
            {{ row.log.state_name }}
          </span>
          <span class="logs-message">{{ row.log.message ?? '-' }}</span>
          <span class="logs-chevron" :data-open="openRow === row.index" />
        </button>

        <div v-if="openRow === row.index" :id="`boss-helper-log-${row.index}`" class="logs-detail">
          <div v-if="row.log.job" class="logs-detail-job">
            <span class="cr-eyebrow">岗位快照</span>
            <JobCard :job="row.log.job" />
          </div>

          <div class="logs-detail-main">
            <dl class="logs-summary">
              <dt>时间</dt>
              <dd class="logs-summary-mono">{{ row.log.time ?? '-' }}</dd>
              <dt>结果</dt>
              <dd :style="{ color: token(row.log.state).color, fontWeight: 600 }">
                {{ row.log.state_name }}
              </dd>
              <dt>原因</dt>
              <dd>{{ row.log.message ?? row.log.data?.summary ?? '-' }}</dd>
            </dl>

            <section v-if="row.log.data?.aiFilteringQ" class="logs-ai">
              <div class="logs-ai-head" data-tone="ai">
                <span class="logs-ai-dot" />
                AI 过滤 · FILTERING
              </div>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiFilteringQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="row.log.data.aiFilteringR" value="thinking" title="思考过程">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiFilteringR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiFilteringAtext }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="row.log.data?.aiGreetingQ" class="logs-ai">
              <div class="logs-ai-head" data-tone="acc">
                <span class="logs-ai-dot" />
                AI 招呼语 · GREETING
              </div>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiGreetingQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="row.log.data.aiGreetingR" value="thinking" title="思考过程">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiGreetingR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiGreetingA }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="row.log.data?.aiReplyQ" class="logs-ai">
              <div class="logs-ai-head" data-tone="info">
                <span class="logs-ai-dot" />
                AI 回复 · REPLY
              </div>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="input" title="上下文">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiReplyInput }}</pre>
                </UAccordionItem>
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiReplyQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="row.log.data.aiReplyR" value="thinking" title="思考过程">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiReplyR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="cr-sc logs-pre">{{ row.log.data.aiReplyA }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="row.log.data?.err || row.log.data?.error" class="logs-ai">
              <div class="logs-ai-head" data-tone="err">
                <span class="logs-ai-dot" />
                错误信息 · ERROR
              </div>
              <pre class="cr-sc logs-pre">{{
                row.log.data.err ?? formatJson(row.log.data.error)
              }}</pre>
            </section>

            <details v-if="row.log.data" class="logs-raw">
              <summary>原始详情</summary>
              <pre class="cr-sc logs-pre">{{ formatJson(row.log.data) }}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
