<script lang="ts" setup>
import { generateText } from 'ai'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

import type { ModelConf } from '@/composables/useModel'
import { getEffectiveAiTimeoutMs } from '@/composables/useModel/common'
import { openai } from '@/composables/useModel/openai'
import type { OpenaiLLMConf } from '@/composables/useModel/openai'
import { normalizeOpenaiConfig } from '@/composables/useModel/openai-utils'
import { jsonClone } from '@/utils/deepmerge'
import { logger } from '@/utils/logger'
import { sanitizeSensitiveText } from '@/utils/sensitive'

import LLMForm from './LLMForm.vue'

const props = defineProps<{
  model?: ModelConf
}>()
const emit = defineEmits<{ (e: 'create', data: ModelConf): void }>()

const toast = useToast()

function color16() {
  const r = Math.floor(Math.random() * 256)
  const g = Math.floor(Math.random() * 256)
  const b = Math.floor(Math.random() * 256)
  const color = `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  return color
}

const show = defineModel<boolean>({ required: true })
const createName = ref(props.model?.name || '')
const createColor = ref(props.model?.color || color16())
const testShow = ref(false)

const llmFormData = reactive(
  normalizeOpenaiConfig(
    jsonClone(props.model?.data ?? ({ mode: 'openai', advanced: {}, other: {} } as OpenaiLLMConf)),
  ),
)

const testIn = ref('')
const testOut = ref('')
const testStatus = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const modelLoading = ref(false)
const modelError = ref('')
const modelSourceUrl = ref('')
const baseUrlNotice = ref('')
const discoveredModels = ref<string[]>([])
let modelRefreshTimer: ReturnType<typeof setTimeout> | undefined

const modelItems = computed(() =>
  Array.from(new Set([llmFormData.model, ...discoveredModels.value].filter(Boolean))),
)

const testExample = {
  Json: [
    `我现在失业了,想找一个新工作,但岗位需求良莠不齐,我需要你对下面的岗位进行评分,我想要双休的,最好可以早九晚五,8小时的.不需要外出,不需要和客户聊天,不需要推销,最后给我Json格式的zifui
\`\`\` 岗位信息
周末双休，早十晚七，带薪年假至少半个月，法定节假日正常放假，购买社保，带薪培训。
网络销售!网络销售!不要再问我是不是纯电销啦!也不是贷款!!!公司的小伙伴很友好，面试结果当天就通知!没有kpi!放心咨询!
职位详情
1.通过公司提供的精准数据进行网络跟进和维护客户2，及时解答客户的相关问题，完成相关销售工作
工作时间:10:00-19:00午休12:00-13:30，固定周末双休，节假日全部正常休假
不需要外出，公司提供精准数据，公平起步，新老人提成一样，氛围好，好晋升
薪资待遇:
熟手无责底薪(4000-6000)起+销售提成+各种奖金，开单奖，综合薪资12-20k，缴纳社保，节日福利
新人最低无责底薪4000，没有业绩考核，有业绩的按照阶梯底薪从4000到6000不等，提成和老员工一样的提成点位没有业绩考核，底薪一直都是无责的，试用期也不会打折!
任职要求:
1.学历不限，18-35岁，男女不限
2.沟通表达能力好，抗压性强，性格外向，逻辑思维能力，复盘总结，有上进心
晋升空间:专员-组长--经理-总监 提供晋升机会
\`\`\`
输出符合下面定义的Json格式字符串
interface aiFiltering {
  rating: number; // 分数, 低于40的我会筛选掉
  negative: string[] | string; // 扣分项
  positive: string[] | string; // 加分项
}
`,
    `你叫做“妙妙”，是一款叫做“妙语笔记”的智能助手，接下来你会分析下面用户的输入：
"""
我的称呼是吴楷鹏，可以叫我大帅哥，出生于香港回归的那一年，生日是 3 月 13 号，喜欢上班
"""
设定：
1. 现在是 2025.10.01 21:21，时区是 Asia/Shanghai
2. 提取昵称、性别、出生日期，剩余全部信息整理成个人介绍
3. 要求输出结构化 JSON 对象，符合下面 TypeScript：
interface UserInfo {
  nickname?: string;
  gender?: 'male'  | 'female';
  dataOfBirth?: string;
  bio?: string;
}
4. 这是例子：const userInfo = {
    "nickname":"董小姐",
    "gender": "female",
    "dateOfBirth":"2001-03-07",
    "bio": "家住在长沙，喜欢做饭"
}

接下来开始分析：const userInfo=`,
  ],
  弱智: [
    '请问你怎么看待鲁迅打周树人呢?',
    '小于90度的是锐角，等于90度的是直角，大于90度的是钝角\n开水有100度，所以开水是钝角吗？',
  ],
}

function sanitizeError(err: unknown) {
  return sanitizeSensitiveText(err instanceof Error ? err.message : String(err), [
    llmFormData.api_key,
    llmFormData.advanced?.extra_headers,
  ])
}

async function refreshModels() {
  modelError.value = ''
  baseUrlNotice.value = ''
  modelSourceUrl.value = ''
  if (!llmFormData.base_url || !llmFormData.api_key) {
    discoveredModels.value = []
    return
  }

  modelLoading.value = true
  try {
    const result = await openai.discoverModels(normalizeOpenaiConfig(llmFormData))
    discoveredModels.value = result.models
    modelSourceUrl.value = result.sourceUrl
    if (result.models.length && !llmFormData.model) {
      llmFormData.model = result.models[0]
    }
    if (result.suggestedBaseUrl && llmFormData.base_url !== result.suggestedBaseUrl) {
      llmFormData.base_url = result.suggestedBaseUrl
      baseUrlNotice.value = `已自动修正 Base URL 为 ${result.suggestedBaseUrl}`
    }
    modelError.value = result.error ?? ''
  } catch (err) {
    discoveredModels.value = []
    modelError.value = sanitizeError(err)
  } finally {
    modelLoading.value = false
  }
}

function debounceRefreshModels() {
  if (modelRefreshTimer) clearTimeout(modelRefreshTimer)
  modelRefreshTimer = setTimeout(() => {
    void refreshModels()
  }, 600)
}

async function test() {
  const data: ModelConf = JSON.parse(JSON.stringify(props.model || { name: '', key: '' }))
  data.name = createName.value
  try {
    data.data = normalizeOpenaiConfig(jsonClone(llmFormData)) as ModelConf['data'] & {}
  } catch (err) {
    testStatus.value = 'error'
    testOut.value = sanitizeError(err)
    toast.add({
      title: testOut.value,
      color: 'error',
    })
    return
  }

  if (!data.data.base_url || !data.data.api_key || !data.data.model) {
    testStatus.value = 'error'
    testOut.value = '请先填写 Base URL、API Key 和模型名'
    toast.add({
      title: testOut.value,
      color: 'warning',
    })
    return
  }

  const model = openai.createModel(data.data)

  logger.group('LLMTest')
  testStatus.value = 'loading'
  testOut.value = '请求中...'
  try {
    const result = await generateText({
      model: model,
      prompt: testIn.value.trim() || '请用一句中文回复：模型连接正常。',
      timeout: getEffectiveAiTimeoutMs(data.data.other?.timeout),
      allowSystemInMessages: true,
    })
    logger.debug('TestRes', result)
    testOut.value = result.reasoningText
      ? `<思考过程>${result.reasoningText}</思考过程>\n\n${result.text}`
      : result.text
    testStatus.value = 'success'
  } catch (err: any) {
    testStatus.value = 'error'
    testOut.value = sanitizeError(err)
    toast.add({
      title: testOut.value,
      color: 'error',
    })
  }

  logger.groupEnd()
}

function create() {
  const data: ModelConf = jsonClone(props.model || { name: '', key: '' })
  data.name = createName.value
  try {
    data.data = normalizeOpenaiConfig(jsonClone(llmFormData)) as ModelConf['data'] & {}
  } catch (err) {
    toast.add({
      title: sanitizeError(err),
      color: 'error',
    })
    return
  }
  data.data.mode = 'openai'
  data.color = createColor.value
  emit('create', data)
}

watch(
  () => [
    llmFormData.base_url,
    llmFormData.api_key,
    JSON.stringify(llmFormData.advanced?.extra_headers ?? {}),
  ],
  debounceRefreshModels,
  { immediate: true },
)

onBeforeUnmount(() => {
  if (modelRefreshTimer) clearTimeout(modelRefreshTimer)
})
</script>

<template>
  <UModal
    v-model:open="show"
    :title="props.model ? '编辑AI模型' : '创建AI模型'"
    :ui="{ content: 'sm:max-w-[70%]' }"
    :dismissible="false"
  >
    <template #body>
      <div class="overflow-y-auto" style="max-height: 60vh; padding: 20px">
        <UFormField>
          <template #label>
            <span :style="{ background: createColor }" class="size-2"></span>
            <span>名称</span></template
          >
          <UInput v-model="createName" />
        </UFormField>

        <div class="mt-4">
          <LLMForm v-model="llmFormData" :model-items="modelItems" />
          <div class="mt-3 space-y-2 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                color="neutral"
                variant="outline"
                size="sm"
                :loading="modelLoading"
                @click="refreshModels()"
              >
                刷新模型列表
              </UButton>
              <span v-if="modelLoading" class="text-muted">正在获取模型列表...</span>
              <span v-else-if="discoveredModels.length" class="text-muted">
                已从 {{ modelSourceUrl }} 获取 {{ discoveredModels.length }} 个模型
              </span>
              <span v-else-if="modelSourceUrl" class="text-muted">
                已请求 {{ modelSourceUrl }}
              </span>
            </div>
            <UAlert
              v-if="baseUrlNotice"
              color="info"
              variant="subtle"
              title="Base URL 已修正"
              :description="baseUrlNotice"
            />
            <UAlert
              v-if="modelError"
              color="error"
              variant="subtle"
              title="模型列表获取失败"
              :description="modelError"
            />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="show = false"> 取消 </UButton>
        <UButton color="neutral" @click="testShow = true"> 测试 </UButton>
        <UButton @click="create"> 保存 </UButton>
      </div>
    </template>
  </UModal>
  <UModal
    v-model:open="testShow"
    title="模型测试"
    :ui="{ content: 'sm:max-w-[70%]' }"
    :dismissible="false"
  >
    <template #body>
      <UFieldGroup class="mb-4">
        <template v-for="(example, key) in testExample" :key="key">
          <UButton v-for="(item, index) in example" :key="key + index" @click="testIn = item">
            {{ key }}
            {{ index + 1 }}
          </UButton>
        </template>
      </UFieldGroup>
      <div class="grid grid-cols-2 gap-3">
        <UTextarea v-model="testIn" :rows="9" placeholder="输入提示词" />
        <UTextarea :model-value="testOut" :rows="9" placeholder="GPT响应" />
      </div>
      <UAlert
        v-if="testStatus === 'success'"
        class="mt-3"
        color="success"
        variant="subtle"
        title="测试请求成功"
      />
      <UAlert
        v-else-if="testStatus === 'error'"
        class="mt-3"
        color="error"
        variant="subtle"
        title="测试请求失败"
        :description="testOut"
      />
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="testShow = false"> 返回 </UButton>
        <UButton :loading="testStatus === 'loading'" @click="test"> 请求 </UButton>
      </div>
    </template>
  </UModal>
</template>
