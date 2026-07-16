<script lang="ts" setup generic="T extends object">
import UInput from '@nuxt/ui/components/Input.vue'
import UInputMenu from '@nuxt/ui/components/InputMenu.vue'
import UInputNumber from '@nuxt/ui/components/InputNumber.vue'
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue'
import USlider from '@nuxt/ui/components/Slider.vue'
import USwitch from '@nuxt/ui/components/Switch.vue'
import { useId } from 'vue'

import type { LLMInfoValM, LLMInfoValF } from '@/composables/useModel/type'

const props = defineProps<{
  info: LLMInfoValM<T, object> | LLMInfoValF<T, any>
  label: string
  depth?: number
}>()

const fromVal = defineModel<any>({
  required: true,
})

const LLMFormRef = inject<Ref<HTMLDivElement>>('LLMFormRef')
const isSetVal = ref(fromVal.value !== undefined)
const fieldId = useId()
const controlId = `${fieldId}-value`
const descriptionId = `${fieldId}-description`
const fieldLabel = computed(() => props.info.label ?? props.label)
</script>

<template>
  <template v-if="'alert' in info">
    <UAlert
      :title="info.label"
      :description="info.desc"
      :color="info.alert"
      variant="subtle"
      class="mb-4 relative left-1/2 -translate-x-1/2 w-[102%]"
    />
    <div class="space-y-3">
      <LLMFormItem
        v-for="(x, k) in info.value"
        :key="k"
        :label="k"
        v-model="fromVal[k]"
        :info="x"
        :depth="(depth || 0) + 1"
      />
    </div>
  </template>

  <fieldset
    v-else
    class="form-field-container min-w-0 rounded-md border border-default p-3"
    :aria-describedby="info.desc ? descriptionId : undefined"
  >
    <legend class="px-1 text-sm font-medium text-default">
      <span :title="info.desc" class="inline-flex items-center text-center gap-2">
        <UIcon v-if="info.desc" name="i-lucide-info" />
        {{ fieldLabel }}
        <span v-if="info.required" aria-hidden="true" class="text-error">*</span>
      </span>
    </legend>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <UCheckbox
        v-if="info.config?.disabled || !info.required"
        :id="`${fieldId}-enabled`"
        :name="`${fieldId}-enabled`"
        v-model="isSetVal"
        :aria-label="`启用${fieldLabel}`"
        @update:model-value="
          (x) => {
            if (!x) fromVal = undefined
          }
        "
        :disabled="info.config?.disabled"
      />
      <template v-if="info.required || isSetVal">
      <UInputNumber
        v-if="info.type === 'input' && info.format === 'number'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
      ></UInputNumber>
      <UInputMenu
        v-else-if="info.type === 'input' && info.format === 'menu'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
        :portal="LLMFormRef"
        :clear="false"
        @create="
          (x) => {
            fromVal = x
          }
        "
      >
      </UInputMenu>
      <UInput
        v-else-if="info.type === 'input'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
      ></UInput>
      <USelectMenu
        v-else-if="info.type === 'select'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
        :clear="false"
        :portal="LLMFormRef"
      ></USelectMenu>
      <USlider
        v-else-if="info.type === 'slider'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
        :ui="{ root: 'w-1/2 min-w-50' }"
      ></USlider>
      <USwitch
        v-else-if="info.type === 'switch'"
        :id="controlId"
        :name="controlId"
        :aria-label="fieldLabel"
        :aria-describedby="info.desc ? descriptionId : undefined"
        v-model="fromVal"
        v-bind="info.config"
      ></USwitch>
      <div v-else>Unsupported form element {{ info }}</div>
      </template>
    </div>
    <p v-if="info.desc" :id="descriptionId" class="mt-2 text-xs leading-relaxed text-muted">
      {{ info.desc }}
    </p>
  </fieldset>
</template>

<style scoped>
.form-field-container {
  transition: all 0.2s ease;
}

.form-field-container :deep(.ui-form-field) {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
