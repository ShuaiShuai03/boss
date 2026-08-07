<script lang="ts" setup>
import { computed, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const ctx = useHelper()
const emit = defineEmits<{
  navigate: [tab: 'rules' | 'logs']
}>()

const statistics = ctx.statistics

const conf = useConf()
const statisticCycle = ref(1)

const statisticCycleData = [
  {
    label: '近三日',
    help: '愿你每一次投递都能得到回应',
    date: 3,
  },
  {
    label: '本周',
    help: '愿你早日找到心满意足的工作',
    date: 7,
  },
  {
    label: '本月',
    help: '愿你在面试中得到满意的结果',
    date: 30,
  },
  {
    label: '历史',
    help: '愿你能早九晚五还双休带五险',
    date: -1,
  },
]

const cycle = computed(() => {
  const date = statisticCycleData[statisticCycle.value].date
  let ans = 0
  for (
    let i = 0;
    // eslint-disable-next-line no-unmodified-loop-condition
    (date === -1 || i < date - 1) && i < statistics.statisticsData.value.length;
    i++
  ) {
    ans += statistics.statisticsData.value[i].success
  }
  return ans
})

const initializationLoading = computed(() => ctx.initializationStatus.value === 'loading')
const initializationFailed = computed(() => ctx.initializationStatus.value === 'error')
const stopReason = computed(() => ctx.workflow?.stopReason.value ?? null)
const startBlockedByStopReason = computed(() => stopReason.value?.code === 'context_invalidated')

async function retryInitialization() {
  await ctx.ensureInitialized(true).catch(() => undefined)
}

function handleStopReasonAction() {
  const reason = stopReason.value
  if (!reason) return
  if (reason.code === 'context_invalidated') {
    location.reload()
  } else if (reason.code === 'consecutive_failures' || reason.code === 'unexpected_error') {
    emit('navigate', 'logs')
  } else if (reason.code === 'no_jobs' || reason.code === 'no_more_jobs') {
    ctx.reset()
  } else {
    void ctx.start()
  }
}

const stopReasonActionLabel = computed(() => {
  switch (stopReason.value?.code) {
    case 'context_invalidated':
      return '刷新页面'
    case 'consecutive_failures':
    case 'unexpected_error':
      return '查看日志'
    case 'no_jobs':
    case 'no_more_jobs':
      return '重新检查岗位'
    case 'batch_limit':
      return '开始下一批'
    default:
      return '继续'
  }
})

function percent(value: number) {
  if (!statistics.todayData.total) return '0.0'
  return ((value / statistics.todayData.total) * 100).toFixed(1)
}

const stats = computed(() => {
  const filtered = percent(statistics.todayData.total - statistics.todayData.success)
  const repeat = percent(statistics.todayData.repeat)
  const inactive = percent(statistics.todayData.activityFilter)
  return [
    {
      en: 'Scanned',
      label: '岗位总数',
      value: String(statistics.todayData.total),
      unit: '份',
      width: '100%',
      color: 'var(--cr-fg2)',
      help: '统计当天脚本扫描过的所有岗位',
    },
    {
      en: 'Filtered',
      label: '过滤比例',
      value: filtered,
      unit: '%',
      width: `${filtered}%`,
      color: 'var(--cr-acc)',
      help: '统计当天岗位过滤的比例,被过滤/总数',
    },
    {
      en: 'Repeat',
      label: '重复比例',
      value: repeat,
      unit: '%',
      width: `${repeat}%`,
      color: 'var(--cr-info)',
      help: '统计当天刷到了多少处理过的岗位,重复/总数',
    },
    {
      en: 'Inactive',
      label: '不活跃比例',
      value: inactive,
      unit: '%',
      width: `${inactive}%`,
      color: 'var(--cr-err)',
      help: '统计当天岗位中的活跃情况,不活跃/总数',
    },
  ]
})

/** 近 7 天迷你柱状：statisticsData 是不含今天的历史，索引 0 最近。 */
const spark = computed(() => {
  const history = statistics.statisticsData.value
  const days = [
    ...Array.from({ length: 6 }, (_, i) => history[5 - i]).map((item) => ({
      date: item?.date ?? '',
      value: item?.success ?? 0,
    })),
    { date: statistics.todayData.date, value: statistics.todayData.success },
  ]
  const peak = Math.max(1, ...days.map((day) => day.value))
  return days.map((day, index) => ({
    ...day,
    height: `${Math.max(2, Math.round((day.value / peak) * 100))}%`,
    color: index === days.length - 1 ? 'var(--cr-acc)' : 'var(--cr-line2)',
  }))
})
</script>

<template>
  <div class="console">
    <Alert
      id="config-statistics"
      description="数据并不完全准确；每批投递数量只控制本插件单批暂停点，BOSS 平台限制由平台自身处理。"
      color="warning"
      show-icon
    />
    <UAlert
      v-if="initializationLoading"
      role="status"
      aria-live="polite"
      color="info"
      variant="subtle"
      title="正在加载配置"
      description="配置、模型和统计数据就绪前不会开始投递。"
    />
    <div v-else-if="initializationFailed" role="alert" class="console-notice is-error">
      <span class="console-notice-stripe" />
      <div class="console-notice-body">
        <p class="console-notice-title">配置加载失败，已阻止开始投递</p>
        <p class="console-notice-desc">
          {{ ctx.initializationError.value || '请检查扩展状态后重试。' }}
        </p>
      </div>
      <button
        type="button"
        class="cr-b console-notice-action is-error"
        @click="retryInitialization"
      >
        重新加载
      </button>
    </div>
    <div
      v-if="stopReason"
      :role="stopReason.severity === 'error' ? 'alert' : 'status'"
      class="console-notice"
      :class="stopReason.severity === 'error' ? 'is-error' : 'is-warn'"
      data-testid="workflow-stop-reason"
    >
      <span class="console-notice-stripe" />
      <div class="console-notice-body">
        <p class="console-notice-title">{{ stopReason.title }}</p>
        <p class="console-notice-desc">{{ stopReason.message }}</p>
      </div>
      <button
        type="button"
        class="cr-b console-notice-action"
        :class="stopReason.severity === 'error' ? 'is-error' : ''"
        :disabled="startBlockedByStopReason && stopReason.code !== 'context_invalidated'"
        @click="handleStopReasonAction"
      >
        {{ stopReasonActionLabel }}
      </button>
    </div>
    <UAlert
      v-if="ctx.workflow?.recoveryMessage.value"
      role="status"
      aria-live="polite"
      color="info"
      variant="subtle"
      title="正在核验执行状态"
      :description="ctx.workflow.recoveryMessage.value"
      data-testid="workflow-recovery-status"
    />

    <div v-if="conf.configLevel.intermediate" class="console-stats">
      <div v-for="stat in stats" :key="stat.en" class="console-stat" :data-help="stat.help">
        <span class="cr-eyebrow">{{ stat.en }}</span>
        <span class="console-stat-label">{{ stat.label }}</span>
        <span class="console-stat-value">
          {{ stat.value }}<i>{{ stat.unit }}</i>
        </span>
        <div class="console-stat-track">
          <div class="console-stat-fill" :style="{ width: stat.width, background: stat.color }" />
        </div>
      </div>

      <div class="console-stat console-cycle" :data-help="statisticCycleData[statisticCycle].help">
        <div class="console-cycle-seg">
          <button
            v-for="(item, index) in statisticCycleData"
            :key="item.label"
            type="button"
            class="cr-seg console-cycle-btn"
            :data-active="statisticCycle === index"
            :aria-pressed="statisticCycle === index"
            @click="statisticCycle = index"
          >
            {{ item.label }}
          </button>
        </div>
        <div class="console-cycle-value">
          <span class="console-stat-value is-accent">
            {{ cycle + statistics.todayData.success }}<i>份</i>
          </span>
          <span class="console-cycle-help">{{ statisticCycleData[statisticCycle].help }}</span>
        </div>
        <div class="console-spark">
          <span
            v-for="(bar, index) in spark"
            :key="index"
            :title="`${bar.date || '—'}：${bar.value} 份`"
            :style="{ height: bar.height, background: bar.color }"
          />
        </div>
      </div>
    </div>
  </div>
</template>
