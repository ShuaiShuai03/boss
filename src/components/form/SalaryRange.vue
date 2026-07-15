<script lang="ts" setup>
import { type InputNumberProps } from '@nuxt/ui'
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    value: [number, number, boolean]
    unit: string
    show: boolean
    step?: number
    controls?: boolean
    ui?: InputNumberProps['ui']
    label?: string
  }>(),
  {
    controls: true,
  },
)

const rangeId = useId()
const unitId = `${rangeId}-unit`
const inputUi = computed<InputNumberProps['ui']>(() => props.ui ?? { base: 'max-w-25' })

const handleToggle = () => {
  props.value[2] = !props.value[2]
}
</script>

<template>
  <UFieldGroup>
    <UInputNumber
      v-model="props.value[0]"
      :min="0"
      :step="props.step"
      :increment="false"
      :decrement="false"
      :ui="inputUi"
      :id="`${rangeId}-minimum`"
      :name="`${rangeId}-minimum`"
      :aria-label="`${props.label || '范围'}最低值`"
      :aria-describedby="unitId"
    />
    <UBadge>-</UBadge>
    <UInputNumber
      v-model="props.value[1]"
      :min="0"
      :step="props.step"
      :increment="false"
      :decrement="false"
      :ui="inputUi"
      :id="`${rangeId}-maximum`"
      :name="`${rangeId}-maximum`"
      :aria-label="`${props.label || '范围'}最高值`"
      :aria-describedby="unitId"
    />

    <UBadge :id="unitId">{{ props.unit }}</UBadge>
    <UButton
      v-if="props.show"
      :aria-pressed="props.value[2]"
      :aria-label="`${props.label || '范围'}匹配方式：${props.value[2] ? '严格' : '宽松'}`"
      @click="handleToggle"
    >
      {{ props.value[2] ? '严格' : '宽松' }}
    </UButton>
    <slot />
  </UFieldGroup>
</template>
