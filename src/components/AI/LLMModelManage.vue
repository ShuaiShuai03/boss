<script lang="ts" setup>
import { ref } from 'vue'

import Alert from '@/components/Alert.vue'
import type { ModelConf } from '@/composables/useModel'
import { useModel } from '@/composables/useModel'
import deepmerge, { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'

import CreateLLM from './LLMModelEdit.vue'

const modelStore = useModel()
const createBoxShow = ref(false)
const open = ref(false)

async function del(d: ModelConf) {
  await modelStore.mutateAndSave((models) => {
    const index = models.findIndex((model) => model.key === d.key)
    if (index >= 0) models.splice(index, 1)
  }, '模型已删除并保存')
}

async function copy(d: ModelConf) {
  const copy = jsonClone(d)
  copy.key = new Date().getTime().toString()
  copy.name = `${copy.name} 副本`
  await modelStore.mutateAndSave((models) => models.push(copy), '模型副本已创建并保存')
}

const createModelData = ref()

function edit(d: ModelConf) {
  createModelData.value = d
  createBoxShow.value = true
}

function newllm() {
  createModelData.value = undefined
  createBoxShow.value = true
}

async function create(d: ModelConf) {
  await modelStore.mutateAndSave((models) => {
    if (d.key) {
      const old = models.find((v) => v.key === d.key)
      if (old) {
        deepmerge(old, d, { clone: false })
      } else {
        d.key = new Date().getTime().toString()
        models.push(d)
      }
    } else {
      d.key = new Date().getTime().toString()
      models.push(d)
    }
  }, '模型已应用并保存')
  createBoxShow.value = false
}

function close() {
  open.value = false
}

function exportllm() {
  exportJson(jsonClone(modelStore.modelData.value), 'Ai模型配置')
}

async function importllm() {
  const data = await importJson<ModelConf[]>()
  await modelStore.mutateAndSave((models) => {
    models.splice(0, models.length, ...data)
  }, '模型配置已导入并保存')
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ai模型配置"
    :ui="{ content: 'sm:max-w-[70%]' }"
    ref="manageModelRef"
    :dismissible="false"
  >
    <slot />
    <template #body>
      <UTable
        :data="modelStore.modelData.value"
        :columns="[
          { id: 'model', header: '模型' },
          { id: 'desc', header: '描述' },
          { id: 'manage', header: '管理' },
        ]"
        style="width: 100%"
      >
        <template #model-cell="{ row }">
          <div style="align-items: center; display: flex">
            <UAvatar :src="row.original.data?.avatar" :alt="row.original.name" />
            <span style="margin-left: 8px">{{ row.original.name }}</span>
          </div>
        </template>
        <template #desc-cell="{ row }">
          <p class="line-clamp-1">
            {{ row.original.data && row.original.data.base_url }}
          </p>
        </template>
        <template #manage-cell="{ row }">
          <div style="width: 200px">
            <UButton variant="link" color="primary" size="sm" @click="del(row.original)">
              删除
            </UButton>
            <UButton variant="link" color="primary" size="sm" @click="copy(row.original)">
              复制
            </UButton>
            <UButton variant="link" color="primary" size="sm" @click="edit(row.original)">
              编辑
            </UButton>
          </div>
        </template>
      </UTable>
      <CreateLLM
        v-if="createBoxShow"
        v-model="createBoxShow"
        :model="createModelData"
        @create="create"
      />
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="close"> 完成 </UButton>
        <UButton color="success" @click="exportllm"> 导出 </UButton>
        <UButton color="success" @click="importllm"> 导入 </UButton>
        <UButton :disabled="modelStore.isLoading.value" @click="newllm"> 新建 </UButton>
      </div>
    </template>
  </UModal>
</template>
