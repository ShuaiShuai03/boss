<script lang="tsx" setup>
import { computed, reactive } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useHelper, type Log } from '@/composables/useHelper'
import { TableColumn } from '@nuxt/ui'

const helper = useHelper()

const dialogData = reactive<{ show: boolean; data?: Log }>({ show: false })

const stateColor = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
} as const

function openLog(log: Log) {
  dialogData.show = true
  dialogData.data = log
}

function formatJson(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

const detailData = computed(() => dialogData.data?.data)

const columns: TableColumn<Log>[] = [
  {
    accessorKey: 'time',
    header: '时间',
    cell: ({ row }) => row.original.time ?? '-',
  },
  {
    accessorKey: 'title',
    header: '对象/岗位',
    cell: ({ row }) => (
      <UButton color="neutral" variant="link" class="px-0" onClick={() => openLog(row.original)}>
        {row.original.title}
      </UButton>
    ),
  },
  {
    accessorKey: 'state_name',
    header: '结果',
    cell: ({ row }) => (
      <UBadge color={stateColor[row.original.state]}>{row.original.state_name}</UBadge>
    ),
  },
  {
    accessorKey: 'message',
    header: '原因/摘要',
    cell: ({ row }) => <span class="line-clamp-2">{row.original.message ?? '-'}</span>,
  },
]
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="text-sm text-gray-500">共 {{ helper.logs.value.length }} 条日志</div>
      <UButton
        color="warning"
        variant="outline"
        size="sm"
        :disabled="helper.logs.value.length === 0"
        @click="helper.logs.clear()"
      >
        清空日志
      </UButton>
    </div>

    <div v-if="helper.logs.value.length === 0" class="empty-state">
      暂无日志。开始投递后会显示批次、翻页、岗位处理和错误详情。
    </div>
    <UTable v-else ref="tableRef" :columns="columns" :data="helper.logs.value" :height="420" />

    <UModal v-model:open="dialogData.show" title="日志详情" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <div class="log-detail">
          <div v-if="dialogData.data?.job" class="log-detail-left">
            <JobCard :job="dialogData.data.job" />
          </div>
          <div class="log-detail-right">
            <section class="log-section">
              <h4>摘要</h4>
              <div class="detail-grid">
                <span>时间</span>
                <strong>{{ dialogData.data?.time ?? '-' }}</strong>
                <span>结果</span>
                <strong>{{ dialogData.data?.state_name }}</strong>
                <span>原因</span>
                <strong>{{ dialogData.data?.message ?? detailData?.summary ?? '-' }}</strong>
              </div>
            </section>

            <section v-if="detailData?.aiFilteringQ" class="log-section">
              <h4>AI过滤</h4>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="ai-text">{{ detailData.aiFilteringQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="detailData.aiFilteringR" value="thinking" title="思考过程">
                  <pre class="ai-text">{{ detailData.aiFilteringR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="ai-text">{{ detailData.aiFilteringAtext }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="detailData?.aiGreetingQ" class="log-section">
              <h4>AI招呼语</h4>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="ai-text">{{ detailData.aiGreetingQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="detailData.aiGreetingR" value="thinking" title="思考过程">
                  <pre class="ai-text">{{ detailData.aiGreetingR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="ai-text">{{ detailData.aiGreetingA }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="detailData?.aiReplyQ" class="log-section">
              <h4>AI回复</h4>
              <UAccordion type="single" collapsible default-value="response">
                <UAccordionItem value="input" title="上下文">
                  <pre class="ai-text">{{ detailData.aiReplyInput }}</pre>
                </UAccordionItem>
                <UAccordionItem value="prompt" title="Prompt">
                  <pre class="ai-text">{{ detailData.aiReplyQ }}</pre>
                </UAccordionItem>
                <UAccordionItem v-if="detailData.aiReplyR" value="thinking" title="思考过程">
                  <pre class="ai-text">{{ detailData.aiReplyR }}</pre>
                </UAccordionItem>
                <UAccordionItem value="response" title="响应">
                  <pre class="ai-text">{{ detailData.aiReplyA }}</pre>
                </UAccordionItem>
              </UAccordion>
            </section>

            <section v-if="detailData?.err || detailData?.error" class="log-section">
              <h4>错误信息</h4>
              <pre class="ai-text">{{ detailData.err ?? formatJson(detailData.error) }}</pre>
            </section>

            <section v-if="detailData" class="log-section">
              <h4>原始详情</h4>
              <pre class="ai-text">{{ formatJson(detailData) }}</pre>
            </section>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton @click="dialogData.show = false">关闭</UButton>
      </template>
    </UModal>
  </div>
</template>

<style lang="scss">
.empty-state {
  padding: 32px;
  text-align: center;
  color: #6b7280;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
}

.log-detail {
  display: flex;
  gap: 20px;
  min-height: 420px;

  &-left {
    flex: 0 0 350px;
  }

  &-right {
    flex: 1;
    overflow-y: auto;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 8px 12px;

  span {
    color: #6b7280;
  }
}

.log-section {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-bottom: 16px;

  h4 {
    margin: 0 0 12px;
    color: #374151;
  }
}

.ai-text {
  white-space: pre-wrap;
  user-select: text;
  padding: 8px;
  line-height: 1.5;
  overflow-x: auto;
}
</style>
