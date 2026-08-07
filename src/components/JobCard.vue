<script setup lang="ts">
import { computed, ref, useId } from 'vue'

import type { JobData } from '@/composables/useHelper'
import { useHelper } from '@/composables/useHelper'

import { jobStatusTokens } from './jobStatusTokens'

const props = defineProps<{
  job: JobData
  hover?: boolean
}>()

const helper = useHelper()

const jobResult = computed(() => helper.jobResultMaps.get(props.job.key))

const jobStatus = computed(() => {
  const status = jobResult.value?.status ?? 'pending'
  return {
    status,
    ...jobStatusTokens[status],
    show: jobResult.value?.status !== 'pending' ? 'flex' : 'none',
  }
})

const showDescription = ref(false)
const descriptionId = useId()

/** AI 过滤跑完后写在 state 上的匹配分；没跑过就不画这个环。 */
const scoreRing = computed(() => {
  const rating = helper.jobMaps.get(props.job.key)?.state.aiFilteringRating
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null
  const value = Math.round(rating)
  // 匹配分可能为负，钳到 0-100 只用于画环，显示的仍是原值
  const clamped = Math.max(0, Math.min(100, value))
  return {
    value,
    deg: `${Math.round(clamped * 3.6)}deg`,
    color: value >= 70 ? 'var(--cr-ok)' : value >= 30 ? 'var(--cr-acc)' : 'var(--cr-err)',
  }
})

function getActiveTimeType(job: JobData): 'success' | 'warning' | 'error' {
  const activeTime = job.activeTime
  if (!activeTime) return 'error'

  const now = Date.now()
  const diffDays = (now - activeTime) / (1000 * 60 * 60 * 24)

  if (diffDays <= 2) return 'success'
  if (diffDays <= 7) return 'warning'
  return 'error'
}

const activityPalette = {
  success: { color: 'var(--cr-ok-on)', soft: 'var(--cr-ok-soft)' },
  warning: { color: 'var(--cr-acc-on)', soft: 'var(--cr-acc-soft)' },
  error: { color: 'var(--cr-err-on)', soft: 'var(--cr-err-soft)' },
} as const

const activity = computed(() => {
  const { activeTime, activeTimeStr } = props.job
  return {
    label: activeTime ? new Date(activeTime).toLocaleDateString() : (activeTimeStr ?? ''),
    title: `活跃时间：${activeTime ? new Date(activeTime).toLocaleString() : (activeTimeStr ?? '未知')}`,
    ...activityPalette[getActiveTimeType(props.job)],
  }
})
</script>

<template>
  <div
    v-if="job"
    class="job-card"
    :class="{ 'job-card-hover': hover }"
    :style="{
      '--state-color': jobStatus.color,
      '--state-soft': jobStatus.soft,
      '--state-show': jobStatus.show,
    }"
  >
    <div
      v-if="jobResult"
      class="card-status"
      :title="jobResult.reason || jobResult.msg"
      role="status"
      aria-live="polite"
      :aria-label="`岗位状态：${jobStatus.label}。${jobResult.msg || jobResult.reason || ''}`"
    >
      <UIcon v-if="jobStatus.status === 'running'" name="i-line-md-loading-twotone-loop" />
      <UIcon v-else-if="jobStatus.status === 'request'" name="i-svg-spinners-wifi-fade" />
      <UIcon v-else-if="jobStatus.status === 'ai'" name="i-line-md-hazard-lights-loop" />
      <span v-else class="card-status-dot" />
      {{ jobStatus.en }}
      <span class="card-status-msg">
        {{ jobResult.msg || jobResult.reason || jobStatus.label }}
      </span>
    </div>

    <div class="card-body">
      <div class="card-head">
        <div class="card-head-text">
          <a :href="job.link" target="_blank" class="card-title">{{ job.jobName }}</a>
          <span class="card-tag">
            {{ job.brand.industry }} · {{ job.degreeName }} · {{ job.brand.scale }}
          </span>
        </div>
        <div
          v-if="scoreRing"
          class="card-score"
          :title="`AI 匹配分 ${scoreRing.value}`"
          :style="{
            background: `conic-gradient(${scoreRing.color} ${scoreRing.deg}, var(--cr-line) 0)`,
          }"
        >
          <span :style="{ color: scoreRing.color }">{{ scoreRing.value }}</span>
        </div>
      </div>

      <h3 class="card-salary">{{ job.salary }}</h3>

      <div
        v-show="showDescription"
        :id="descriptionId"
        class="card-content cr-sc"
        :title="job.jobDescription"
      >
        {{ job.jobDescription }}
      </div>
      <div v-show="!showDescription" class="card-content">
        <div class="card-chips">
          <span v-for="tag in job.skills" :key="tag" class="card-chip">{{ tag }}</span>
          <span v-for="tag in job.jobLabels" :key="tag" class="card-chip is-muted">{{ tag }}</span>
        </div>
        <p v-if="job.welfareList && job.welfareList.length > 0" class="card-welfare">
          {{ job.welfareList.join('、') }}
        </p>
      </div>

      <button
        type="button"
        class="card-details-toggle"
        :aria-expanded="showDescription"
        :aria-controls="descriptionId"
        @click="showDescription = !showDescription"
      >
        {{ showDescription ? '收起职位详情' : '展开职位详情' }}
      </button>

      <div class="card-footer">
        <img alt="" class="avatar" height="26" width="26" :src="job.brand.logo" />
        <div class="card-footer-text">
          <span class="company-name" :title="job.brand.name">{{ job.brand.name }}</span>
          <span class="company-addr">{{ job.address }}</span>
        </div>
        <span
          v-if="activity.label"
          class="card-activity"
          :title="activity.title"
          :style="{ background: activity.soft, color: activity.color }"
        >
          {{ activity.label }}
        </span>
      </div>
    </div>
  </div>
</template>
