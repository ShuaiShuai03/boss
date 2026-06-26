<script lang="ts" setup>
import { computed, reactive, ref, watch } from 'vue'

import JobCard from '@/components/JobCard.vue'
import { formInfoData, defaultFormData, useConf } from '@/composables/conf'
import { parseFiltering } from '@/composables/useApplying/utils'
import { JobData, useHelper } from '@/composables/useHelper'
import { useModel } from '@/composables/useModel'
import { generateOptimizedSystemPrompt } from '@/composables/useModel/promptOptimizer'
import type { Prompt } from '@/types/formData'
import { logger } from '@/utils/logger'

import Alert from '../Alert.vue'

const props = defineProps<{
  data: 'aiGreeting' | 'aiFiltering' | 'aiReply'
}>()
const toast = useToast()
const helper = useHelper()
const conf = useConf()
const model = useModel()
const show = defineModel<boolean>({ required: true })
const currentModel = ref<string>()
const saving = ref(false)
const saveError = ref('')
const optimizing = ref(false)
const optimizerInput = ref('')
const optimizerError = ref('')

const score = ref(10)

const role = ['system', 'user', 'assistant']

const message = ref<Prompt>([])
const canOptimizePrompt = computed(() => props.data === 'aiFiltering' || props.data === 'aiReply')
const optimizerLabel = computed(() =>
  props.data === 'aiFiltering' ? '筛选偏好' : '回复偏好',
)
const optimizerPlaceholder = computed(() =>
  props.data === 'aiFiltering'
    ? '例如：排除 [岗位类型 A]、[岗位类型 B]；优先 [目标方向]；[工作制度/通勤/薪资] 不符合时扣分。'
    : '例如：语气 [克制专业/热情主动]，默认 [1-2] 句；突出 [项目/技能]；只在 HR 明确要求时提供 [联系方式/作品链接]。',
)

function normalizeModelKey(value: unknown) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'key' in value) {
    const key = (value as { key?: unknown }).key
    return typeof key === 'string' ? key : undefined
  }
}

function resetFromConfig() {
  currentModel.value = normalizeModelKey(conf.formData[props.data].model)
  message.value = jsonClone(conf.formData[props.data].prompt)
  score.value = props.data === 'aiFiltering' ? (conf.formData[props.data].score ?? 10) : 10
  saveError.value = ''
  optimizerInput.value = ''
  optimizerError.value = ''
}

function inputExample() {
  message.value = jsonClone(defaultFormData[props.data].prompt)
}

function removeMessage(item: Prompt[number]) {
  message.value = message.value.filter((v) => v !== item)
}

function addMessage() {
  message.value.push({ role: 'user', content: '' })
}

function findSystemMessageIndex() {
  return message.value.findIndex((item) => item.role === 'system')
}

async function optimizeSystemPrompt() {
  const target =
    props.data === 'aiFiltering' || props.data === 'aiReply' ? props.data : undefined
  if (!target) {
    return
  }

  const modelKey = normalizeModelKey(currentModel.value)
  if (!modelKey) {
    toast.add({
      title: '请先选择模型',
      color: 'warning',
    })
    return
  }
  const modelConf = model.modelData.value.find((item) => item.key === modelKey)
  if (!modelConf) {
    toast.add({
      title: '模型不存在，请先在模型配置中保存该模型',
      color: 'warning',
    })
    return
  }

  const userPreference = optimizerInput.value.trim()
  if (!userPreference) {
    toast.add({
      title: '请先填写个性化要求',
      color: 'warning',
    })
    return
  }

  const systemIndex = findSystemMessageIndex()
  const currentSystemPrompt = systemIndex >= 0 ? message.value[systemIndex].content : ''
  if (!currentSystemPrompt.trim()) {
    toast.add({
      title: '当前 Prompt 缺少 system 消息',
      color: 'warning',
    })
    return
  }

  optimizing.value = true
  optimizerError.value = ''
  try {
    const optimized = await generateOptimizedSystemPrompt(modelConf, {
      target,
      currentSystemPrompt,
      userPreference,
    })
    message.value[systemIndex] = {
      ...message.value[systemIndex],
      content: optimized,
    }
    toast.add({
      title: 'System Prompt 已优化，请测试后保存',
      color: 'success',
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    optimizerError.value = errorMessage
    logger.error('AI 优化 System Prompt 失败', err)
    toast.add({
      title: errorMessage,
      color: 'error',
    })
  } finally {
    optimizing.value = false
  }
}

const testDialog = ref(false)

interface TestData {
  key: string
  job: JobData
  checked: boolean | string | number
  loading: boolean
}
interface TestContent {
  id: string
  time: string
  prompt?: string
  reasoning_content?: string | null
  content?: string
}

const testData = reactive<Array<TestData>>([])
const expandTestRowKeys = ref<string[]>([])
const testDataContent = reactive<Record<string, TestContent[]>>({})

function clearTestState() {
  testData.splice(0, testData.length)
  Object.keys(testDataContent).forEach((key) => {
    delete testDataContent[key]
  })
  expandTestRowKeys.value = []
  testJobLoading.value = false
  testJobStop.value = true
}

function handleExpandChange(row: TestData) {
  logger.info('handleExpandChange', row)
  if (expandTestRowKeys.value.includes(row.key)) {
    expandTestRowKeys.value = expandTestRowKeys.value.filter((v) => v !== row.key)
  } else {
    expandTestRowKeys.value.push(row.key)
  }
}

function test() {
  clearTestState()
  testDialog.value = true
}

const testJobLoading = ref(false)
const testJobStop = ref(true)

async function addTestJob(n: number) {
  testJobLoading.value = true
  try {
    let count = 0
    for (let item of helper.jobList.value) {
      if (testData.some((v) => v.job.key === item.key)) {
        continue
      }
      const data = helper.jobMaps.get(item.key) // 加载更多数据
      if (data) {
        item = data.jobData
      }
      testData.push({ key: item.key, job: item, checked: false, loading: false })
      testDataContent[item.key] = []
      count++
      if (count >= n) {
        break
      }
    }
  } finally {
    testJobLoading.value = false
  }
}

async function testJob() {
  if (!testJobStop.value) {
    testJobStop.value = true
    return
  }
  testJobLoading.value = true
  testJobStop.value = false
  const md = model.modelData.value.find((v) => currentModel.value === v.key)
  if (!currentModel.value || !md) {
    toast.add({
      title: '请在上级弹窗右上角选择模型',
      color: 'warning',
    })
    testJobLoading.value = false
    testJobStop.value = true
    return
  }
  try {
    const agentName =
      props.data === 'aiFiltering'
        ? 'filtering'
        : props.data === 'aiGreeting'
          ? 'greetings'
          : 'reply'
    const form = {
      ...conf.formData[props.data],
      enable: true,
      model: currentModel.value,
      prompt: jsonClone(message.value),
    }
    if (!helper.chatModel.createAgent(form, agentName, { json: props.data === 'aiFiltering' })) {
      toast.add({
        title: helper.chatModel.lastCreateAgentError || '模型配置不可用',
        color: 'warning',
      })
      return
    }
    const handle = async (item: TestData) => {
      if (testJobStop.value) {
        return
      }
      try {
        item.loading = true
        const data = helper.jobMaps.get(item.key) ?? {
          jobData: item.job,
          rawData: {} as any,
          state: {},
        }
        const result = await helper.chatModel.chat(agentName, data)
        let content = result.text.trim()
        if (props.data === 'aiFiltering' && content) {
          content = parseFiltering(content).message || content
        }
        testDataContent[item.key].push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          prompt: result.prompt,
          reasoning_content: result.reasoning_content,
          content,
        })
      } catch (err: any) {
        logger.error(err)
        toast.add({
          title: err.message,
          color: 'error',
        })
      } finally {
        item.loading = false
      }
    }

    for (let i = 0; i < testData.length; i += 4) {
      const batch = testData.slice(i, i + 4)
      await Promise.all(batch.map(handle))
    }
  } catch (err: any) {
    logger.error(err)
    toast.add({
      title: err.message,
      color: 'error',
    })
  } finally {
    testJobLoading.value = false
    testJobStop.value = true
  }
}

async function savePrompt() {
  const modelKey = normalizeModelKey(currentModel.value)
  if (!modelKey) {
    toast.add({
      title: '请在右上角选择模型',
      color: 'warning',
    })
    return
  }
  if (!model.modelData.value.some((item) => item.key === modelKey)) {
    toast.add({
      title: '模型不存在，请先在模型配置中保存该模型',
      color: 'warning',
    })
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    conf.formData[props.data].model = modelKey
    conf.formData[props.data].prompt = jsonClone(message.value)

    if (props.data === 'aiFiltering') {
      conf.formData[props.data].score = score.value
    }
    await conf.confSaving()
    show.value = false
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    saveError.value = message
    logger.error('保存 AI Prompt 失败', err)
  } finally {
    saving.value = false
  }
}

const promptModelRef = useTemplateRef('promptModel')
const testModelRef = useTemplateRef('testModel')

onMounted(() => {
  logger.info('LLMPromptEdit mounted', { promptModelRef, testModelRef })
})

watch(
  [() => props.data, show],
  ([, opened]) => {
    if (opened) {
      resetFromConfig()
    }
  },
  { immediate: true },
)

watch(testDialog, (opened) => {
  if (!opened) {
    clearTestState()
  }
})
</script>

<template>
  <UModal
    v-model:open="show"
    :title="formInfoData[data].label"
    :ui="{ content: 'sm:max-w-[70%]', body: 'flex flex-col gap-4' }"
    :dismissible="false"
  >
    <template #body>
      <div v-if="data === 'aiFiltering'">
        <UFormField label="过滤分数">
          <UInputNumber v-model="score" :min="-100" :max="100" size="sm" placeholder="请输入分数" />
        </UFormField>
      </div>
      <div class="w-full flex items-center justify-between" ref="promptModel">
        <div class="flex gap-2">
          <UButton color="neutral" disabled> 多对话模式 </UButton>
          <UButton color="primary" @click="addMessage"> 添加消息 </UButton>
        </div>
        <div class="flex gap-2">
          <UButton color="info" @click="inputExample"> 填入示例值 </UButton>
          <USelectMenu
            v-model="currentModel"
            :items="model.modelData.value"
            labelKey="name"
            valueKey="key"
            placeholder="选择模型"
            :disabled="model.isLoading.value"
            :portal="promptModelRef?.parentElement ?? false"
          >
            <!-- <template #item="{ item }">
              <div style="display: flex">
                <span
                  v-if="item.vip != null"
                  style="align-items: center; display: inline-flex; margin-right: 6px"
                  v-html="llmIcon.vip"
                />
                <span>{{ item.name }}</span>
              </div>
            </template>
            <template #create-item-label="{ item }">
              <div style="display: flex">
                <span
                  v-if="item.startsWith('vip-')"
                  style="align-items: center; display: inline-flex; margin-right: 6px"
                  v-html="llmIcon.vip"
                />
                <span>{{ item }}</span>
              </div>
            </template> -->
          </USelectMenu>
        </div>
      </div>
      <div v-pre>
        <Alert v-if="currentModel?.startsWith('vip-')" id="vip-alert" title="注意" type="warning">
          会员模型暂时不支持输出 思考过程, 比如deepseekR1，但是不影响模型能力
        </Alert>
        使用 {{}} 来渲染变量。
        <ULink
          to="https://github.com/Ocyss/boss-helper/blob/master/src/types/bossData.d.ts"
          target="_blank"
        >
          变量表
        </ULink>
        <br />
        推荐阅读
        <ULink to="https://langgptai.feishu.cn/wiki/RXdbwRyASiShtDky381ciwFEnpe" target="_blank">
          《LangGPT》
        </ULink>
        的提示词文档学习 ( 示例提示词写的并不好,欢迎AI大佬来提pr )
      </div>
      <div v-if="canOptimizePrompt" class="flex flex-col gap-2 border-y border-gray-200 py-3">
        <UFormField :label="optimizerLabel" :error="optimizerError || undefined">
          <UTextarea
            v-model="optimizerInput"
            autoresize
            :rows="2"
            :maxrows="4"
            :placeholder="optimizerPlaceholder"
          />
        </UFormField>
        <div class="flex justify-end">
          <UButton
            color="primary"
            variant="soft"
            icon="i-lucide-sparkles"
            :loading="optimizing"
            :disabled="saving || optimizing || model.isLoading.value"
            @click="optimizeSystemPrompt"
          >
            AI 优化 System Prompt
          </UButton>
        </div>
      </div>
      <div class="demo-dynamic space-y-3">
        <div v-for="(item, index) in message" :key="index" class="flex items-start gap-2">
          <div class="flex flex-col gap-3 w-27.5">
            <USelectMenu
              v-model="item.role"
              :items="role"
              :portal="promptModelRef?.parentElement ?? false"
              :content="{ side: 'right' }"
            />
            <UButton
              color="error"
              variant="outline"
              @click.prevent="removeMessage(item)"
              class="w-full"
            >
              删除
            </UButton>
          </div>
          <UTextarea v-model="item.content" autoresize :rows="2" :maxrows="6" class="flex-1" />
        </div>
      </div>
      <UAlert
        v-if="saveError"
        color="error"
        variant="subtle"
        title="保存失败"
        :description="saveError"
      />
    </template>

    <template #footer>
      <UButton color="neutral" variant="outline" :disabled="saving || optimizing" @click="show = false">
        关闭
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        :disabled="saving || optimizing || model.isLoading.value"
        @click="test"
      >
        测试
      </UButton>
      <UButton
        color="primary"
        :loading="saving"
        :disabled="optimizing || model.isLoading.value"
        @click="savePrompt"
      >
        保存
      </UButton>
    </template>
  </UModal>
  <UModal
    v-model:open="testDialog"
    title="Prompt 测试"
    :ui="{ content: 'sm:max-w-3xl' }"
    :dismissible="false"
  >
    <template #body>
      <div class="flex gap-2 mb-4" ref="testModel">
        <UButton :loading="testJobLoading" @click="addTestJob(1)" color="neutral">
          从页面添加1个岗位
        </UButton>
        <UButton :loading="testJobLoading" @click="addTestJob(4)" color="neutral">
          从页面添加4个岗位
        </UButton>
        <UButton :loading="testJobLoading" @click="addTestJob(10)" color="neutral">
          从页面添加10个岗位
        </UButton>
      </div>
      <div class="overflow-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-gray-200">
              <th style="width: 32px"></th>
              <th style="width: 180px; text-align: left; padding: 8px">岗位名</th>
              <th style="text-align: left; padding: 8px">内容</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in testData" :key="row.key">
              <tr
                class="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                @click="handleExpandChange(row)"
              >
                <td style="padding: 4px; text-align: center">
                  <UButton
                    variant="ghost"
                    size="xs"
                    :icon="
                      expandTestRowKeys.includes(row.key)
                        ? 'i-lucide-chevron-down'
                        : 'i-lucide-chevron-right'
                    "
                  />
                </td>
                <td style="width: 180px; padding: 8px">
                  <UPopover mode="hover" :portal="testModelRef?.parentElement ?? false">
                    <div class="flex items-center">
                      <UIcon v-if="row.loading" name="i-line-md-loading-twotone-loop" />
                      {{ row.job.jobName }}
                    </div>
                    <template #content>
                      <JobCard :job="row.job" :hover="false" style="width: 300px" />
                    </template>
                  </UPopover>
                </td>
                <td style="padding: 8px">
                  <div
                    :title="row.job.jobDescription"
                    style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                  >
                    {{ row.job.jobDescription }}
                  </div>
                </td>
              </tr>
              <tr v-if="expandTestRowKeys.includes(row.key)">
                <td colspan="3">
                  <div class="test-content-wrapper">
                    <div class="test-content-list">
                      <div
                        v-for="item in testDataContent[row.key].slice(-3)"
                        :key="item.id"
                        class="test-content-item"
                      >
                        <div class="test-content-time">
                          {{ item.time }}
                        </div>
                        <div v-if="item.prompt" class="test-content-prompt" :title="item.prompt">
                          {{ item.prompt }}
                        </div>
                        <div
                          v-if="item.reasoning_content"
                          class="test-content-reasoning-content"
                          :title="item.reasoning_content"
                        >
                          {{ item.reasoning_content }}
                        </div>
                        <div class="test-content-content" :title="item.content">
                          {{ item.content }}
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
    <template #footer>
      <UButton color="neutral" variant="outline" @click="testDialog = false"> 取消 </UButton>
      <UButton color="primary" @click="testJob">
        {{ testJobStop ? '开始测试' : '停止测试' }}
      </UButton>
    </template>
  </UModal>
</template>
