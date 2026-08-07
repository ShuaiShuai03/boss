<script lang="ts" setup>
import { useMediaQuery } from '@vueuse/core'
import type { ComponentPublicInstance } from 'vue'
import { ref, watch } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { useHelper } from '@/composables/useHelper'

const jobSetRef = ref<Record<string, Element | ComponentPublicInstance | null>>({})
const following = ref(true)
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

const cards = ref<HTMLDivElement>()
const helper = useHelper()

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!cards.value) {
    return
  }
  const left = e.deltaY || e.deltaX
  cards.value.scrollLeft = cards.value.scrollLeft + left
  following.value = false
}

function scrollHandler(key = helper.currentJob.value) {
  if (!key) {
    return
  }
  const d = jobSetRef.value[key]
  if (!d) {
    return
  }

  if ('scrollIntoView' in d) {
    d.scrollIntoView({
      behavior: prefersReducedMotion.value ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  } else if ('$el' in d) {
    d?.$el.scrollIntoView({
      behavior: prefersReducedMotion.value ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }
}

watch(
  () => helper.currentJob.value,
  (v) => {
    if (following.value && v) {
      scrollHandler(v)
    }
  },
)
</script>

<template>
  <!-- 外观配置里的“模糊卡片”会去找 .boss-helper-card 和 .card-grid-overlay，别改这两个类名 -->
  <section style="order: -1" class="boss-helper-card queue relative">
    <header class="queue-head">
      <span class="cr-eyebrow">岗位队列 · Queue</span>
      <span class="queue-rule" />
      <button
        type="button"
        class="cr-b queue-follow"
        :data-active="following"
        :aria-pressed="following"
        :aria-label="following ? '关闭岗位自动跟随' : '开启岗位自动跟随'"
        data-help="开启后队列会自动滚动到正在处理的岗位。"
        @click="following = !following"
      >
        <span class="queue-follow-dot" />
        {{ following ? '自动跟随中' : '自动跟随已关' }}
      </button>
    </header>

    <div
      v-if="helper.jobList.value.length"
      ref="cards"
      class="card-grid cr-sc"
      @wheel.stop="onWheel"
    >
      <JobCard
        v-for="job in helper.jobList.value"
        :ref="
          (ref) => {
            jobSetRef[job.key] = ref
          }
        "
        :key="job.key"
        :job="job"
        hover
      />
    </div>
    <p v-else class="queue-empty">
      等待岗位数据 — 打开 BOSS 直聘的推荐或搜索列表后，检测到的岗位会出现在这里。
    </p>

    <div class="card-grid-overlay" />
  </section>
</template>
