<script lang="ts" setup>
import { useId } from 'vue'

defineProps<{
  label: string
  help?: string
  disabled?: boolean
}>()

const include = defineModel<boolean | undefined>('include', {
  default: undefined,
})
const enable = defineModel<boolean>('enable', { required: true })
const fieldId = useId()
const helpId = `${fieldId}-help`
</script>

<template>
  <fieldset
    :data-help="help"
    :title="help"
    :aria-describedby="help ? helpId : undefined"
    class="min-w-0 rounded-md border border-default p-3"
  >
    <legend class="px-1 text-sm font-medium text-default">
      <span class="inline-flex flex-wrap items-center gap-1">
        <UCheckbox
          :id="`${fieldId}-enabled`"
          :name="`${fieldId}-enabled`"
          v-model="enable"
          :aria-label="`启用${label}`"
          size="sm"
        />
        <span>{{ label }}</span>
        <UButton
          class="pl-px"
          v-if="include != null"
          :color="include ? 'primary' : 'warning'"
          variant="link"
          size="sm"
          :disabled
          :aria-pressed="include"
          :aria-label="`${label}匹配方式：${include ? '包含' : '排除'}`"
          @click.stop="include = !include"
        >
          {{ include ? '包含' : '排除' }}
        </UButton>
      </span>
    </legend>
    <div class="min-w-0 max-w-full">
      <slot />
    </div>
    <p v-if="help" :id="helpId" class="mt-2 text-xs leading-relaxed text-muted">{{ help }}</p>
  </fieldset>
</template>
