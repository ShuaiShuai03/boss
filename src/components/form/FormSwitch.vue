<script lang="ts" setup>
import type { FormDataAi } from '@/types/formData'

defineProps<{
  label: string
  lock?: boolean
  help?: string
  disabled?: boolean
  data: Partial<FormDataAi>
}>()

defineEmits<{
  (e: 'change', data: Partial<FormDataAi>): void
  (e: 'show'): void
}>()
</script>

<template>
  <UFieldGroup :data-help="help">
    <UButton
      :color="data.enable ? 'primary' : 'neutral'"
      :variant="data.enable ? 'solid' : 'outline'"
      :disabled="lock || disabled"
      :aria-pressed="Boolean(data.enable)"
      @click="$emit('change', data)"
    >
      <span>{{ label }}</span>
      <span class="font-normal opacity-90">{{ data.enable ? '已启用' : '已停用' }}</span>
    </UButton>
    <UButton
      color="neutral"
      variant="outline"
      :disabled
      :aria-label="`配置${label}`"
      :title="`配置${label}`"
      @click="$emit('show')"
    >
      <UIcon name="i-lucide-settings" class="size-4" />
    </UButton>
  </UFieldGroup>
</template>
