<script setup lang="ts">
import { ref, useId } from 'vue'

import { JobData, useHelper } from '@/composables/useHelper'

import { jobStatusTokens } from './jobStatusTokens'

const helper = useHelper()

const props = defineProps<{
  job: JobData
  hover?: boolean
}>()

const jobResult = computed(() => {
  return helper.jobResultMaps.get(props.job.key)
})

const jobStatus = computed(() => {
  const status = jobResult.value?.status ?? 'pending'
  const token = jobStatusTokens[status]
  return {
    status,
    ...token,
    show: jobResult.value?.status !== 'pending' ? 'flex' : 'none',
  }
})

const showDescription = ref(false)
const descriptionId = useId()

function getActiveTimeType(job: JobData): 'success' | 'warning' | 'error' {
  const activeTime = job.activeTime
  if (!activeTime) return 'error'

  const now = Date.now()
  const diffDays = (now - activeTime) / (1000 * 60 * 60 * 24)

  if (diffDays <= 2) return 'success'
  if (diffDays <= 7) return 'warning'
  return 'error'
}
</script>

<template>
  <div
    class="job-card"
    :class="{ 'job-card-hover': hover }"
    :style="{
      '--state-background': jobStatus.background,
      '--state-foreground': jobStatus.foreground,
      '--state-show': jobStatus.show,
    }"
    v-if="job"
  >
    <div class="card-tag">{{ job.brand.industry }},{{ job.degreeName }},{{ job.brand.scale }}</div>
    <!-- `https://www.zhipin.com/job_detail/${job.encryptJobId}.html`" -->
    <a :href="job.link" target="_blank" class="card-title">
      {{ job.jobName }}
    </a>
    <h3 class="card-salary">
      {{ job.salary }}
    </h3>
    <div v-show="showDescription" :id="descriptionId" class="card-content" :title="job.jobDescription">
      {{ job.jobDescription }}
    </div>
    <div v-show="!showDescription" class="card-content">
      <div>
        <div class="flex flex-wrap gap-1">
          <UBadge v-for="tag in job.skills" :key="tag" size="sm" variant="subtle" color="warning">
            {{ tag }}
          </UBadge>
          <UBadge
            v-for="tag in job.jobLabels"
            :key="tag"
            size="sm"
            variant="subtle"
            color="success"
          >
            {{ tag }}
          </UBadge>
        </div>
      </div>
      <div class="card-footer" v-if="job.welfareList && job.welfareList.length > 0">
        {{ job.welfareList.join(',') }}
      </div>
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

    <div v-if="job.activeTime || job.activeTimeStr" class="active-time-tag">
      <UBadge :color="getActiveTimeType(job)" variant="subtle">
        活跃时间：{{
          job.activeTime ? new Date(job.activeTime).toLocaleString() : job.activeTimeStr
        }}
      </UBadge>
    </div>

    <div class="author-row">
      <img alt="" class="avatar" height="80" :src="job.brand.logo" width="80" />
      <div>
        <span class="company-name">{{ job.brand.name }}</span>
        <!-- <h4>{{ job.cityName }}/{{ job.areaDistrict }}/{{ job.businessDistrict }}</h4> -->
        <h4>{{ job.address }}</h4>
      </div>
    </div>
    <div
      class="card-status flex-row gap-2 justify-center items-center"
      v-if="jobResult"
      :title="jobResult?.reason || jobResult?.msg"
      role="status"
      aria-live="polite"
      :aria-label="`岗位状态：${jobStatus.label}。${jobResult?.msg || jobResult?.reason || ''}`"
    >
      <UIcon v-if="jobStatus.status === 'running'" name="i-line-md-loading-twotone-loop" />
      <UIcon v-else-if="jobStatus.status === 'request'" name="i-svg-spinners-wifi-fade" />
      <UIcon v-else-if="jobStatus.status === 'ai'" name="i-line-md-hazard-lights-loop" />
      {{ jobResult?.msg || jobResult?.reason || '无内容' }}
    </div>
  </div>
</template>
