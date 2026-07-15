<script lang="ts" setup>
import type { ComponentPublicInstance } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { ref } from 'vue'

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
  <div style="order: -1" class="boss-helper-card relative">
    <div ref="cards" class="card-grid" @wheel.stop="onWheel">
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
    <UButton
      size="md"
      :color="following ? 'primary' : 'neutral'"
      variant="outline"
      :aria-pressed="following"
      :aria-label="following ? '关闭岗位自动跟随' : '开启岗位自动跟随'"
      @click="following = !following"
      icon="i-lucide-accessibility"
      title="自动跟随"
      class="absolute bottom-6 left-2"
    >
    </UButton>
    <div class="card-grid-overlay" />
  </div>
</template>
