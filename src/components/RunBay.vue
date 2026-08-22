<script lang="ts" setup>
import { computed } from 'vue'

import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const ctx = useHelper()
const conf = useConf()

const TICKS = 30
const STREAM_LIMIT = 6

const workflow = computed(() => ctx.workflow)
const status = computed(() => workflow.value?.status.value ?? 'pending')
const running = computed(() => ctx.workflowRunning.value)
const stopReason = computed(() => workflow.value?.stopReason.value ?? null)
const batchFull = computed(() => stopReason.value?.code === 'batch_limit')
const blocked = computed(() => stopReason.value?.code === 'context_invalidated')
const initializing = computed(() => ctx.initializationStatus.value === 'loading')

const batchLimit = computed(
  () => workflow.value?.batchLimit.value || conf.formData.deliveryLimit.value || 1,
)
const batchSubmitted = computed(() => workflow.value?.batchSubmitted.value ?? 0)
const percent = computed(() =>
  ((Math.min(batchSubmitted.value, batchLimit.value) / batchLimit.value) * 100).toFixed(1),
)

/** 30 格刻度条：已完成的填满，正在跑的那一格用亮琥珀标出来。 */
const ticks = computed(() => {
  const filled = Math.round(
    (Math.min(batchSubmitted.value, batchLimit.value) / batchLimit.value) * TICKS,
  )
  return Array.from({ length: TICKS }, (_, index) => {
    if (index < filled) return 'var(--cr-acc)'
    if (index === filled && running.value) return 'var(--cr-acc2)'
    return 'var(--cr-line)'
  })
})

const live = computed(() => {
  if (batchFull.value) return { color: 'var(--cr-acc)', label: 'PAUSED · 已达上限' }
  if (status.value === 'recovering')
    return { color: 'var(--cr-info)', label: 'RECOVERING · 恢复中' }
  if (status.value === 'error') return { color: 'var(--cr-err)', label: 'ERROR · 已中断' }
  if (running.value) return { color: 'var(--cr-ok)', label: 'RUNNING · 投递中' }
  return { color: 'var(--cr-fg3)', label: 'IDLE · 待机' }
})

const runLabel = computed(() => {
  if (status.value === 'recovering') return '恢复中'
  if (blocked.value) return '刷新后重试'
  if (batchFull.value) return '开始下一批'
  if (running.value) return '暂停'
  if (status.value === 'stop') return '继续'
  return '开始'
})

const runDisabled = computed(() => {
  if (running.value) return false
  return initializing.value || !ctx.initializationReady.value || blocked.value
})

function toggleRun() {
  if (running.value) {
    ctx.stop()
    return
  }
  if (blocked.value) {
    location.reload()
    return
  }
  void ctx.start()
}

const pageCurrent = computed(() =>
  workflow.value && workflow.value.total.value > 0 ? workflow.value.current.value : 0,
)
const pageTotal = computed(() => workflow.value?.total.value ?? 0)
const failures = computed(() => workflow.value?.consecutiveFailures.value ?? 0)
const failureLimit = computed(() => conf.formData.maxConsecutiveFailures.value)
const failureColor = computed(() => (failures.value > 0 ? 'var(--cr-err)' : 'var(--cr-ok)'))
const today = ctx.statistics.todayData

/** 实时流水直接复用日志流，最新的在最上面。 */
const streamTone = {
  success: { tag: 'OK', color: 'var(--cr-ok-on)' },
  warning: { tag: 'SKIP', color: 'var(--cr-acc-on)' },
  danger: { tag: 'ERR', color: 'var(--cr-err-on)' },
  info: { tag: 'INFO', color: 'var(--cr-info-on)' },
} as const

const stream = computed(() =>
  ctx.logs.value
    .slice(-STREAM_LIMIT)
    .reverse()
    .map((log, index) => {
      const tone = streamTone[log.state] ?? streamTone.info
      return {
        key: `${log.time ?? ''}-${index}-${log.title}`,
        // 日志里存的是完整 toLocaleString()，流水只要时间那一段。
        time: log.time?.split(' ').pop() ?? '',
        tag: tone.tag,
        color: tone.color,
        message: log.message ? `${log.title} · ${log.message}` : log.title,
      }
    }),
)
</script>

<template>
  <div class="run-bay">
    <div class="run-bay-control">
      <div class="run-bay-live">
        <span class="run-bay-dot" :style="{ background: live.color }" />
        <span class="run-bay-live-label" :style="{ color: live.color }">{{ live.label }}</span>
      </div>
      <button
        type="button"
        class="cr-b run-bay-run"
        data-help="开始后会按当前规则自动筛选并投递，再次点击可暂停。"
        :disabled="runDisabled"
        :style="{ background: running ? 'var(--cr-acc2)' : 'var(--cr-acc)' }"
        @click="toggleRun"
      >
        <span v-if="!running" class="run-bay-icon-play" />
        <span v-else class="run-bay-icon-pause" />
        {{ runLabel }}
      </button>
      <button
        type="button"
        class="cr-b run-bay-reset"
        data-help="重置已被筛选的岗位，开始后将重新处理。"
        @click="ctx.reset()"
      >
        重置筛选队列
      </button>
    </div>

    <div class="run-bay-batch">
      <div class="run-bay-batch-head">
        <span class="cr-eyebrow">本批投递 · Batch</span>
        <span class="run-bay-batch-value">{{ batchSubmitted }}</span>
        <span class="run-bay-batch-limit">/ {{ batchLimit }}</span>
        <span class="run-bay-batch-pct">{{ percent }}%</span>
      </div>
      <div
        class="run-bay-ticks"
        role="progressbar"
        :aria-valuenow="batchSubmitted"
        :aria-valuemin="0"
        :aria-valuemax="batchLimit"
        aria-label="本批成功投递进度"
        data-help="本批成功投递进度，达到每批投递数量后会自动暂停。"
      >
        <span v-for="(color, index) in ticks" :key="index" :style="{ background: color }" />
      </div>
      <div class="run-bay-metrics">
        <div>
          <span class="run-bay-metric-label">当前页面</span>
          <span class="run-bay-metric-value">
            {{ pageCurrent }}<i>/{{ pageTotal }}</i>
          </span>
        </div>
        <div>
          <span class="run-bay-metric-label">连续失败熔断</span>
          <span class="run-bay-metric-value" :style="{ color: failureColor }">
            {{ failures }}<i>/{{ failureLimit }}</i>
          </span>
        </div>
        <div>
          <span class="run-bay-metric-label">动作间隔</span>
          <span class="run-bay-metric-value">
            {{ conf.formData.actionDelayMs.value }}<i>ms</i>
          </span>
        </div>
        <div>
          <span class="run-bay-metric-label">今日成功</span>
          <span class="run-bay-metric-value">
            {{ today.success }}<i>/{{ today.total }}</i>
          </span>
        </div>
      </div>
    </div>

    <div class="run-bay-stream">
      <span class="cr-eyebrow">实时流水 · Stream</span>
      <div class="cr-sc run-bay-stream-list" role="log" aria-live="off">
        <p v-if="!stream.length" class="run-bay-stream-empty">开始后这里会显示每一步的处理结果。</p>
        <div v-for="item in stream" :key="item.key" class="run-bay-stream-row">
          <span class="run-bay-stream-time">{{ item.time }}</span>
          <span class="run-bay-stream-tag" :style="{ color: item.color }">{{ item.tag }}</span>
          <span class="run-bay-stream-msg" :title="item.message">{{ item.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
