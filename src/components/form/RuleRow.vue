<script lang="ts" setup>
import { computed, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    /** 规则句子里开关和取值之间的连接词，例如「中出现任意一项时」。 */
    verb?: string
    help?: string
    disabled?: boolean
  }>(),
  { verb: '' },
)

const enable = defineModel<boolean>('enable', { required: true })
/** 不传就不显示「包含 / 排除」，用于薪资、活跃度这类没有方向的规则。 */
const include = defineModel<boolean | undefined>('include', { default: undefined })
/** 不传就不渲染标签输入，改用默认插槽放自定义控件。 */
const values = defineModel<string[] | undefined>('values', { default: undefined })

const fieldId = useId()
const helpId = `${fieldId}-help`
const mode = computed(() => (include.value ? '包含' : '排除'))
</script>

<template>
  <div
    class="rule-row"
    :data-on="enable"
    :data-help="props.help"
    :aria-describedby="props.help ? helpId : undefined"
  >
    <button
      type="button"
      class="cr-tog"
      :data-on="enable"
      :disabled="props.disabled"
      :aria-pressed="enable"
      :aria-label="`启用${props.label}`"
      @click="enable = !enable"
    >
      <i />
    </button>

    <div class="rule-row-sentence">
      <span class="rule-row-label">{{ props.label }}</span>

      <button
        v-if="include !== undefined"
        type="button"
        class="cr-b rule-row-mode"
        :data-include="include"
        :disabled="props.disabled"
        :aria-pressed="include"
        :aria-label="`${props.label}匹配方式：${mode}`"
        @click.stop="include = !include"
      >
        {{ mode }}
      </button>

      <span v-if="props.verb" class="rule-row-verb">{{ props.verb }}</span>

      <div class="rule-row-value">
        <UInputTags
          v-if="values !== undefined"
          :id="fieldId"
          :name="fieldId"
          v-model="values"
          :disabled="props.disabled"
          :aria-label="`${props.label}条件值`"
          placeholder="输入条件后按回车"
        />
        <slot />
      </div>
    </div>

    <span v-if="props.help" :id="helpId" class="rule-row-help" :title="props.help" role="note"
      >?</span
    >
  </div>
</template>
