<script lang="ts" setup>
import { useId } from 'vue'

const props = defineProps<{
  label?: string
}>()
const value = defineModel<string[]>('value', { required: true })
// const options = defineModel<string[]>('options', { required: true })
const inputId = useId()
</script>

<template>
  <UInputTags
    :id="inputId"
    :name="inputId"
    v-model="value"
    :aria-label="props.label ? `${props.label}条件值` : '筛选条件值'"
    placeholder="输入条件后按回车"
  />
</template>
