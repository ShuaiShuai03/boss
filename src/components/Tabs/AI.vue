<script lang="ts" setup>
import { computed, ref } from 'vue'

import LLMModelManage from '@/components/AI/LLMModelManage.vue'
import LLMPromptEdit from '@/components/AI/LLMPromptEdit.vue'
import FormSwitch from '@/components/form/FormSwitch.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import type { FormDataAi } from '@/types/formData'

const helper = useHelper()
const conf = useConf()
const model = useModel()
const aiBoxShow = ref(false)
const aiBox = ref<'aiGreeting' | 'aiFiltering' | 'aiReply' | 'record'>('aiGreeting')
const aiControlsDisabled = computed(
  () => conf.isLoading.value || model.isLoading.value || helper.workflow?.status.value === 'running',
)

async function change(v: Partial<FormDataAi>) {
  v.enable = !v.enable
  try {
    await conf.confSaving()
  } catch {
    v.enable = !v.enable
  }
}
</script>

<template>
  <div class="flex flex-col gap-3" data-help="AI 配置">
    <div class="flex flex-wrap gap-3">
      <FormSwitch
        :label="formInfoData.aiGreeting.label"
        :data-help="formInfoData.aiGreeting['data-help']"
        :data="conf.formData.aiGreeting"
        :lock="aiControlsDisabled"
        :disabled="aiControlsDisabled"
        @show="
          () => {
            aiBox = 'aiGreeting'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiFiltering.label"
        :data-help="formInfoData.aiFiltering['data-help']"
        :data="conf.formData.aiFiltering"
        :lock="aiControlsDisabled"
        :disabled="aiControlsDisabled"
        @show="
          () => {
            aiBox = 'aiFiltering'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <FormSwitch
        :label="formInfoData.aiReply.label"
        :data-help="formInfoData.aiReply['data-help']"
        :data="conf.formData.aiReply"
        :lock="aiControlsDisabled"
        :disabled="aiControlsDisabled"
        @show="
          () => {
            aiBox = 'aiReply'
            aiBoxShow = true
          }
        "
        @change="change"
      />
      <!-- <formSwitch
      v-bind="formInfoData.record"
      :data="formData.record"
      @show="
        aiBox = 'record';
        aiBoxShow = true;
      "
      @change="change"
    /> -->
    </div>
    <div>
      <LLMModelManage>
        <UButton
          color="primary"
          data-help="配置需要使用的LLM大模型"
          :loading="model.isLoading.value"
          :disabled="conf.isLoading.value || model.isLoading.value"
        >
          模型配置
        </UButton>
      </LLMModelManage>
    </div>

    <LLMPromptEdit
      v-if="aiBoxShow && aiBox !== 'record'"
      v-model="aiBoxShow"
      :key="aiBox"
      :data="aiBox"
    />
  </div>
</template>
