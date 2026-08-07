<script lang="ts" setup>
import { computed, ref } from 'vue'

import LLMModelManage from '@/components/AI/LLMModelManage.vue'
import LLMPromptEdit from '@/components/AI/LLMPromptEdit.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import type { ModelConf } from '@/composables/useModel'

type CapabilityKey = 'aiGreeting' | 'aiFiltering' | 'aiReply'

const helper = useHelper()
const conf = useConf()
const model = useModel()

const aiBoxShow = ref(false)
const aiBox = ref<CapabilityKey>('aiGreeting')
const toggling = ref<CapabilityKey | null>(null)

const aiControlsDisabled = computed(
  () =>
    conf.isLoading.value || model.isLoading.value || helper.workflow?.status.value === 'running',
)

/** 没有真正的连通性探测，所以只如实反映配置是否填齐，不假装“已连接”。 */
function modelState(item: ModelConf) {
  const ready = Boolean(item.data?.base_url && item.data?.api_key && item.data?.model)
  return ready
    ? { label: '已配置', color: 'var(--cr-ok-on)', soft: 'var(--cr-ok-soft)' }
    : { label: '未完成', color: 'var(--cr-mute-on)', soft: 'var(--cr-surf3)' }
}

function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 3)
      .toUpperCase() || 'LLM'
  )
}

const models = computed(() => model.modelData.value)

function modelName(key?: string) {
  if (!key) return '未选择模型'
  return models.value.find((item) => item.key === key)?.name ?? '模型已移除'
}

const capabilities = computed(() =>
  (
    [
      { key: 'aiGreeting', dot: 'var(--cr-acc)', en: 'GREETING' },
      { key: 'aiFiltering', dot: 'var(--cr-ai)', en: 'JOB FILTER' },
      { key: 'aiReply', dot: 'var(--cr-info)', en: 'REPLIES' },
    ] as Array<{ key: CapabilityKey; dot: string; en: string }>
  ).map((item) => {
    const data = conf.formData[item.key]
    return {
      ...item,
      data,
      label: formInfoData[item.key].label,
      help: formInfoData[item.key]['data-help'],
      model: modelName(data.model),
      prompt: data.prompt
        .map((message) => message.content)
        .join('\n\n')
        .trim(),
    }
  }),
)

async function toggle(key: CapabilityKey) {
  const target = conf.formData[key]
  target.enable = !target.enable
  toggling.value = key
  try {
    await conf.confSaving()
  } catch {
    target.enable = !target.enable
  } finally {
    toggling.value = null
  }
}

function openPrompt(key: CapabilityKey) {
  aiBox.value = key
  aiBoxShow.value = true
}
</script>

<template>
  <div class="ai" data-help="先配置模型，再按需启用 AI 招呼语、岗位过滤和后续回复。">
    <div class="ai-intro">
      <h2 class="ai-title">AI 能力</h2>
      <p class="ai-desc">
        先接一个兼容 OpenAI
        协议的模型，再决定它在流水线的哪一步说话。每项能力的提示词都可以单独编辑和测试。
      </p>
    </div>

    <section class="ai-models">
      <header class="ai-models-head">
        <span class="cr-eyebrow">已连接模型 · Models</span>
        <LLMModelManage>
          <UButton
            color="primary"
            size="xs"
            data-help="添加或编辑兼容 OpenAI 接口的模型，并验证连接是否可用。"
            :loading="model.isLoading.value"
            :disabled="conf.isLoading.value || model.isLoading.value"
          >
            + 新建 / 管理模型
          </UButton>
        </LLMModelManage>
      </header>

      <p v-if="!models.length" class="ai-models-empty">
        还没有配置模型。点击「新建 / 管理模型」添加一个兼容 OpenAI 接口的连接。
      </p>
      <div v-for="item in models" :key="item.key" class="ai-model-row">
        <span class="ai-model-badge">{{ initials(item.name) }}</span>
        <div class="ai-model-text">
          <span class="ai-model-name">{{ item.name }}</span>
          <span class="ai-model-url">{{ item.data?.base_url || '未填写接口地址' }}</span>
        </div>
        <span
          class="ai-model-state"
          :style="{ background: modelState(item).soft, color: modelState(item).color }"
        >
          <span class="ai-model-state-dot" />
          {{ modelState(item).label }}
        </span>
        <LLMModelManage>
          <UButton color="neutral" variant="outline" size="xs" :aria-label="`编辑 ${item.name}`">
            编辑
          </UButton>
        </LLMModelManage>
      </div>
    </section>

    <div class="ai-caps">
      <article
        v-for="capability in capabilities"
        :key="capability.key"
        class="ai-cap"
        :data-on="capability.data.enable"
        :data-help="capability.help"
      >
        <div class="ai-cap-body">
          <div class="ai-cap-head">
            <span class="ai-cap-dot" :style="{ background: capability.dot }" />
            <span class="ai-cap-label">{{ capability.label }}</span>
            <button
              type="button"
              class="cr-tog"
              :data-on="capability.data.enable"
              :disabled="aiControlsDisabled || toggling === capability.key"
              :aria-pressed="capability.data.enable"
              :aria-label="`启用${capability.label}`"
              @click="toggle(capability.key)"
            >
              <i />
            </button>
          </div>

          <p class="ai-cap-desc">{{ capability.help }}</p>

          <div class="ai-cap-meta">
            <span class="ai-cap-model">{{ capability.model }}</span>
            <span class="ai-cap-en">{{ capability.en }}</span>
          </div>

          <UFormField
            v-if="capability.key === 'aiFiltering'"
            label="最低投递分"
            :data-help="'AI 评分低于该值的岗位会被跳过。'"
            class="ai-cap-score"
          >
            <UInputNumber
              v-model="conf.formData.aiFiltering.score"
              :step="1"
              size="xs"
              :disabled="aiControlsDisabled"
            />
          </UFormField>

          <pre class="cr-sc ai-cap-prompt">{{ capability.prompt || '尚未配置提示词。' }}</pre>
        </div>

        <footer class="ai-cap-footer">
          <button type="button" class="cr-b ai-cap-edit" @click="openPrompt(capability.key)">
            编辑提示词
          </button>
          <button
            type="button"
            class="cr-b ai-cap-test"
            title="在提示词编辑器中测试该能力"
            @click="openPrompt(capability.key)"
          >
            测试
          </button>
        </footer>
      </article>
    </div>

    <LLMPromptEdit v-if="aiBoxShow" :key="aiBox" v-model="aiBoxShow" :data="aiBox" />
  </div>
</template>
