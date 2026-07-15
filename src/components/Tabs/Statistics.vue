<script lang="ts" setup>
import { computed, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'

const ctx = useHelper()
const emit = defineEmits<{
  navigate: [tab: 'config' | 'logs']
}>()

const statistics = ctx.statistics

// const { next, page } = usePager()
const conf = useConf()
const statisticCycle = ref(1)

const statisticCycleData = [
  {
    label: '近三日投递',
    help: '愿你每一次投递都能得到回应',
    date: 3,
  },
  {
    label: '本周投递',
    help: '愿你早日找到心满意足的工作',
    date: 7,
  },
  {
    label: '本月投递',
    help: '愿你在面试中得到满意的结果',
    date: 30,
  },
  {
    label: '历史投递',
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

const batchLimit = computed(
  () => ctx.workflow?.batchLimit.value ?? conf.formData.deliveryLimit.value,
)
const batchSubmitted = computed(() => ctx.workflow?.batchSubmitted.value ?? 0)
const batchProgress = computed(() => {
  if (!batchLimit.value) return 0
  return Number(((batchSubmitted.value / batchLimit.value) * 100).toFixed(1))
})
const initializationLoading = computed(() => ctx.initializationStatus.value === 'loading')
const initializationFailed = computed(() => ctx.initializationStatus.value === 'error')
const stopReason = computed(() => ctx.workflow?.stopReason.value ?? null)
const startBlockedByStopReason = computed(
  () => stopReason.value?.code === 'context_invalidated',
)
const startLabel = computed(() => {
  if (startBlockedByStopReason.value) return '刷新后重试'
  if (stopReason.value?.code === 'batch_limit') return '开始下一批'
  if (ctx.workflow?.status.value === 'stop') return '继续'
  return '开始'
})

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

</script>

<template>
  <div class="flex gap-2 flex-col">
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
    <div
      v-else-if="initializationFailed"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-error/40 bg-error/10 px-4 py-3 text-sm"
    >
      <div>
        <p class="font-medium text-error">配置加载失败，已阻止开始投递</p>
        <p class="text-muted">
          {{ ctx.initializationError.value || '请检查扩展状态后重试。' }}
        </p>
      </div>
      <UButton color="error" variant="soft" @click="retryInitialization">重新加载</UButton>
    </div>
    <div
      v-if="stopReason"
      :role="stopReason.severity === 'error' ? 'alert' : 'status'"
      class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-default bg-elevated px-4 py-3 text-sm"
      data-testid="workflow-stop-reason"
    >
      <div>
        <p class="font-medium text-default">{{ stopReason.title }}</p>
        <p class="text-muted">{{ stopReason.message }}</p>
      </div>
      <UButton
        :color="stopReason.severity === 'error' ? 'error' : 'primary'"
        variant="soft"
        @click="handleStopReasonAction"
      >
        {{ stopReasonActionLabel }}
      </UButton>
    </div>
    <div
      v-if="conf.configLevel.intermediate"
      class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
    >
      <div data-help="统计当天脚本扫描过的所有岗位">
        <div class="text-sm text-gray-500">岗位总数：</div>
        <div class="text-2xl font-semibold">
          {{ statistics.todayData.total }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
      <div data-help="统计当天岗位过滤的比例,被过滤/总数">
        <div class="text-sm text-gray-500">过滤比例：</div>
        <div class="text-2xl font-semibold">
          {{ percent(statistics.todayData.total - statistics.todayData.success) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天刷到了多少处理过的岗位,重复/总数">
        <div class="text-sm text-gray-500">重复比例：</div>
        <div class="text-2xl font-semibold">
          {{ percent(statistics.todayData.repeat) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div data-help="统计当天岗位中的活跃情况,不活跃/总数">
        <div class="text-sm text-gray-500">活跃比例：</div>
        <div class="text-2xl font-semibold">
          {{ percent(statistics.todayData.activityFilter) }}
          <span class="text-sm text-gray-400">%</span>
        </div>
      </div>
      <div :data-help="statisticCycleData[statisticCycle].help">
        <UDropdownMenu
          :items="
            statisticCycleData.map((item, index) => ({
              label: item.label,
              onSelect: () => (statisticCycle = index),
            }))
          "
        >
          <div class="text-sm text-gray-500 cursor-pointer flex items-center gap-1">
            {{ statisticCycleData[statisticCycle].label }}:
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 1024 1024">
              <path
                fill="currentColor"
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
              />
            </svg>
          </div>
        </UDropdownMenu>
        <div class="text-2xl font-semibold">
          {{ cycle + statistics.todayData.success }} <span class="text-sm text-gray-400">份</span>
        </div>
      </div>
    </div>
    <div class="flex flex-row gap-2 items-center justify-center">
      <UFieldGroup>
        <UButton
          color="primary"
          data-help="点击开始就会开始投递"
          :loading="initializationLoading || ctx.workflow?.status.value === 'running'"
          :disabled="
            !ctx.initializationReady.value ||
            startBlockedByStopReason ||
            ctx.workflow?.status.value === 'running'
          "
          @click="ctx.start()"
        >
          {{ startLabel }}
        </UButton>
        <UButton
          v-if="ctx.workflow?.status.value === 'stop'"
          color="warning"
          data-help="重置已被筛选的岗位，开始将重新处理"
          @click="ctx.reset()"
        >
          重置筛选
        </UButton>
        <UButton
          v-if="ctx.workflow?.status.value === 'running'"
          color="warning"
          data-help="暂停后应该能继续"
          @click="ctx.stop()"
        >
          暂停
        </UButton>
      </UFieldGroup>
      <UProgress
        data-help="本批成功投递进度，达到每批投递数量后会暂停"
        class="flex-1"
        :value="batchProgress"
      />
      <span class="text-sm text-gray-500">{{ batchSubmitted }}/{{ batchLimit }}</span>
    </div>
  </div>
</template>

<style lang="scss"></style>
