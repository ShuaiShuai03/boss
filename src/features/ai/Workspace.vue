<script setup lang="ts">
import { ref, watch } from 'vue'

import { counter } from '@/message'

import { emptyWorkspace, validateProfile, prepareJob, type AiWorkspace } from './workspace'
const props = defineProps<{ accountId: string }>()
const workspace = ref<AiWorkspace>(emptyWorkspace())
const facts = ref('')
const roles = ref('')
const description = ref('')
const preparation = ref('')
const status = ref('')
const conversationKey = ref('')
const conversationText = ref('')
const conversationSource = ref('')
let accountEpoch = 0
watch(
  () => props.accountId,
  () => {
    accountEpoch++
    workspace.value = emptyWorkspace()
    facts.value = roles.value = description.value = preparation.value = ''
    conversationKey.value = conversationText.value = conversationSource.value = ''
    status.value = ''
  },
  { flush: 'sync' },
)
async function load() {
  const epoch = accountEpoch
  const account = props.accountId
  if (!props.accountId) {
    status.value = '请先登录并识别账号'
    return
  }
  const loaded = await counter.storageGet<AiWorkspace>(
    `local:ai-workspace:${encodeURIComponent(account)}`,
    emptyWorkspace(),
  )
  loaded.usage = await counter.storageGet(
    `local:ai-usage:${encodeURIComponent(account)}`,
    loaded.usage,
  )
  if (epoch !== accountEpoch) return
  workspace.value = loaded
  const current = workspace.value.profiles.at(-1)
  facts.value = current?.facts.join('\n') ?? ''
  roles.value = current?.targetRoles.join('\n') ?? ''
  status.value = `已加载版本 ${current?.version ?? 0}`
}
async function save() {
  const epoch = accountEpoch
  const account = props.accountId
  try {
    if (!props.accountId) throw new Error('请先登录并识别账号')
    const key = `local:ai-workspace:${encodeURIComponent(account)}`
    const current = await counter.storageGet<AiWorkspace>(key, emptyWorkspace())
    if (epoch !== accountEpoch) return
    const profile = validateProfile(
      facts.value.split('\n'),
      roles.value.split('\n'),
      (current.profiles.at(-1)?.version ?? 0) + 1,
    )
    current.profiles = [...current.profiles, profile].slice(-20)
    current.dailyRequestLimit = Math.max(
      1,
      Math.min(1000, Math.floor(workspace.value.dailyRequestLimit || 50)),
    )
    current.usage = await counter.storageGet(
      `local:ai-usage:${encodeURIComponent(account)}`,
      current.usage,
    )
    if (epoch !== accountEpoch) return
    await counter.storageSet(key, current)
    if (epoch !== accountEpoch) return
    workspace.value = current
    status.value = `已保存版本 ${profile.version}`
  } catch (error) {
    if (epoch !== accountEpoch) return
    status.value = error instanceof Error ? error.message : String(error)
  }
}
async function saveFact() {
  const epoch = accountEpoch
  if (
    !props.accountId ||
    !conversationKey.value.trim() ||
    !conversationText.value.trim() ||
    !conversationSource.value.trim()
  ) {
    status.value = '请填写岗位 key、已确认事实和来源'
    return
  }
  const key = `local:ai-workspace:${encodeURIComponent(props.accountId)}`
  const current = await counter.storageGet<AiWorkspace>(key, emptyWorkspace())
  if (epoch !== accountEpoch) return
  const job = conversationKey.value.trim()
  current.conversationFacts[job] = [
    ...(current.conversationFacts[job] ?? []),
    {
      text: conversationText.value.trim().slice(0, 2000),
      source: conversationSource.value.trim().slice(0, 500),
    },
  ].slice(-50)
  await counter.storageSet(key, current)
  if (epoch !== accountEpoch) return
  workspace.value = current
  status.value = '会话事实已保存；只用于该岗位的后续请求'
}
function prepare() {
  try {
    preparation.value = prepareJob(description.value, workspace.value.profiles.at(-1)).prompt
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  }
}
</script>
<template>
  <section class="space-y-4" aria-label="个人证据与岗位准备">
    <h3 class="text-lg font-semibold">个人证据与岗位准备</h3>
    <p>仅填写已确认的经历。保存的版本会用于后续 AI 请求，按当前账号保存在本地。</p>
    <UButton variant="soft" @click="load">加载当前账号资料</UButton>
    <label class="block"
      >已确认经历（每行一条）<UTextarea v-model="facts" class="w-full" :rows="5"
    /></label>
    <label class="block">目标岗位（每行一条）<UTextarea v-model="roles" class="w-full" /></label>
    <label class="block"
      >每日 AI 请求上限<UInput
        v-model.number="workspace.dailyRequestLimit"
        type="number"
        :min="1"
        :max="1000"
    /></label>
    <UButton @click="save">保存新版本</UButton>
    <p>最近统计日 {{ workspace.usage.date || '暂无' }}：已使用 {{ workspace.usage.requests }} 次</p>
    <p role="status">{{ status }}</p>
    <h4 class="font-semibold">已确认会话事实</h4>
    <label class="block">岗位 key<UInput v-model="conversationKey" /></label>
    <label class="block">事实<UTextarea v-model="conversationText" class="w-full" /></label>
    <label class="block"
      >来源（HR 消息时间及原文）<UInput v-model="conversationSource" class="w-full"
    /></label>
    <UButton variant="soft" @click="saveFact">保存会话事实</UButton>
    <label class="block"
      >待准备的岗位原文<UTextarea v-model="description" class="w-full" :rows="5"
    /></label>
    <UButton variant="soft" @click="prepare">生成准备提纲</UButton>
    <label v-if="preparation" class="block"
      >可复制到模型的准备材料<UTextarea v-model="preparation" readonly class="w-full" :rows="10"
    /></label>
  </section>
</template>
