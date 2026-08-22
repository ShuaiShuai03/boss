<script lang="ts" setup>
import { computed, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import RuleRow from '@/components/form/RuleRow.vue'
import SalaryRangeComponent from '@/components/form/SalaryRange.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { getCacheManager } from '@/composables/useApplying'
import { useHelper } from '@/composables/useHelper'
import { amapGeocode } from '@/utils/amap'
import { logger } from '@/utils/logger'

import Appearance from './Appearance.vue'

const helper = useHelper()
const conf = useConf()
const toast = useToast()

const disabled = computed(() => helper.workflowRunning.value || conf.isLoading.value)

function changePreset(value: unknown) {
  if (typeof value === 'string') {
    void conf.switchPreset(value)
  }
}

const salaryRangeAdvanced = ref(false)
const salaryRangeRef = ref()
const amapGeocodeLoading = ref(false)

async function amapGeocodeHandler() {
  amapGeocodeLoading.value = true
  try {
    const res = await amapGeocode(conf.formData.amap.origins)
    if (res) {
      conf.formData.amap.origins = res.location
    } else {
      toast.add({
        title: '获取地址失败',
        color: 'error',
      })
    }
  } catch (error) {
    toast.add({
      title: '获取地址失败',
      color: 'error',
    })
    logger.error(error)
  } finally {
    amapGeocodeLoading.value = false
  }
}

function syncSalaryRange() {
  conf.formData.salaryRange.advancedValue.M[0] = Math.round(
    conf.formData.salaryRange.value[0] * 1000,
  )
  conf.formData.salaryRange.advancedValue.M[1] = Math.round(
    conf.formData.salaryRange.value[1] * 1000,
  )

  conf.formData.salaryRange.advancedValue.D[0] = Math.round(
    conf.formData.salaryRange.advancedValue.M[0] / 21.75,
  )
  conf.formData.salaryRange.advancedValue.D[1] = Math.round(
    conf.formData.salaryRange.advancedValue.M[1] / 21.75,
  )

  conf.formData.salaryRange.advancedValue.H[0] = Math.round(
    conf.formData.salaryRange.advancedValue.D[0] / 8,
  )
  conf.formData.salaryRange.advancedValue.H[1] = Math.round(
    conf.formData.salaryRange.advancedValue.D[1] / 8,
  )
}

function gotoZhipinNotifySetting() {
  window.open('https://www.zhipin.com/web/geek/notify-set?type=greetSet', '_blank')
}

function gotoAmapDevSetting() {
  window.open('https://lbs.amap.com/dev/', '_blank')
}

/** 开关型过滤器写成一句话，和上面的关键词规则排在同一列里。 */
type ToggleRuleKey =
  | 'activityFilter'
  | 'goldHunterFilter'
  | 'friendStatus'
  | 'sameCompanyFilter'
  | 'sameHrFilter'

const toggleRules = computed(() => {
  const rules: Array<{ key: ToggleRuleKey; show: boolean; verb: string }> = [
    { key: 'activityFilter', show: conf.configLevel.intermediate, verb: '过滤掉最近未活跃的 BOSS' },
    { key: 'goldHunterFilter', show: true, verb: '过滤掉猎头发布的职位' },
    { key: 'friendStatus', show: true, verb: '过滤掉已经建立过聊天的 HR' },
    { key: 'sameCompanyFilter', show: conf.configLevel.intermediate, verb: '过滤掉投递过的公司' },
    { key: 'sameHrFilter', show: conf.configLevel.intermediate, verb: '过滤掉投递过的 HR' },
  ]
  return rules.filter((rule) => rule.show)
})
</script>

<template>
  <div class="rules">
    <div class="rules-intro">
      <div>
        <h2 class="rules-title">筛选规则</h2>
        <p class="rules-desc">
          每条规则都写成一句话。打开左侧开关才会生效，点击「包含 / 排除」切换匹配方向。
        </p>
      </div>
      <UFormField label="配置级别" :data-help="formInfoData.configLevel['data-help']">
        <USelectMenu
          v-model="conf.formData.configLevel"
          :items="formInfoData.configLevel.options"
          value-key="value"
          label-key="label"
          :search-input="false"
        />
      </UFormField>
    </div>

    <Alert
      id="config-alert-1"
      show-icon
      title="进行配置前都请先阅读完整的帮助文档，再进行配置，如有bug请反馈"
      type="success"
      description="滚动到底部，差不多150个岗位左右，也会自动停止, 刷新或者变更期望重新获取新的岗位即可。"
    />
    <Alert
      id="config-alert-2"
      show-icon
      color="success"
      description="使用自定义招呼语前 推荐禁用boss直聘自带招呼语"
      :actions="[
        {
          label: '前往',
          color: 'neutral',
          variant: 'subtle',
          onClick: gotoZhipinNotifySetting,
        },
      ]"
    />
    <Alert
      id="config-alert-3"
      type="success"
      description="所有配置选项皆有帮助提示，不懂用法请进入帮助模式进行查看，若是对帮助说明有疑问请反馈最好能给出改进意见。"
    />

    <UForm :disabled="disabled">
      <div class="rules-list" data-help="筛选配置">
        <RuleRow
          v-model:enable="conf.formData.company.enable"
          v-model:include="conf.formData.company.include"
          v-model:values="conf.formData.company.value"
          :label="formInfoData.company.label"
          :help="formInfoData.company['data-help']"
          :disabled="disabled"
          verb="中出现任意一项时"
        />
        <RuleRow
          v-model:enable="conf.formData.jobTitle.enable"
          v-model:include="conf.formData.jobTitle.include"
          v-model:values="conf.formData.jobTitle.value"
          :label="formInfoData.jobTitle.label"
          :help="formInfoData.jobTitle['data-help']"
          :disabled="disabled"
          verb="中出现任意一项时"
        />
        <RuleRow
          v-model:enable="conf.formData.jobContent.enable"
          v-model:include="conf.formData.jobContent.include"
          v-model:values="conf.formData.jobContent.value"
          :label="formInfoData.jobContent.label"
          :help="formInfoData.jobContent['data-help']"
          :disabled="disabled"
          verb="中出现任意一项时"
        />
        <RuleRow
          v-if="conf.configLevel.intermediate"
          v-model:enable="conf.formData.hrPosition.enable"
          v-model:include="conf.formData.hrPosition.include"
          v-model:values="conf.formData.hrPosition.value"
          :label="formInfoData.hrPosition.label"
          :help="formInfoData.hrPosition['data-help']"
          :disabled="disabled"
          verb="精确等于其中一项时"
        />
        <RuleRow
          v-if="conf.configLevel.intermediate"
          v-model:enable="conf.formData.jobAddress.enable"
          v-model:include="conf.formData.jobAddress.include"
          v-model:values="conf.formData.jobAddress.value"
          :label="formInfoData.jobAddress.label"
          :help="formInfoData.jobAddress['data-help']"
          :disabled="disabled"
          verb="中出现任意一项时"
        />

        <RuleRow
          v-if="conf.configLevel.intermediate"
          ref="salaryRangeRef"
          v-model:enable="conf.formData.salaryRange.enable"
          :label="formInfoData.salaryRange.label"
          :help="formInfoData.salaryRange['data-help']"
          :disabled="disabled"
          verb="需落在"
        >
          <SalaryRangeComponent
            :value="conf.formData.salaryRange.value"
            :label="formInfoData.salaryRange.label"
            unit="K"
            :show="false"
          >
            <UButton
              v-if="conf.configLevel.advanced"
              @click="salaryRangeAdvanced = !salaryRangeAdvanced"
            >
              高级
            </UButton>
          </SalaryRangeComponent>
          <UPopover
            :reference="salaryRangeRef"
            :open="salaryRangeAdvanced"
            placement="top"
            trigger="click"
          >
            <template #content>
              <div class="p-3 flex flex-col gap-3 max-w-85">
                <UAlert
                  title="宽松匹配: 薪资范围有任何重叠即匹配, 如10-20K: 15-20K, 15-21k, 20-26k 都满足, 21-22k 不满足"
                  color="info"
                  :close="false"
                />
                <UAlert
                  title="严格匹配: 目标薪资需完全在职位范围内, 如10-20K: 10-15K 和15-20K 满足, 15-21k 不满足"
                  color="info"
                  :close="false"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.value"
                  unit="K"
                  :show="true"
                  :ui="{ base: 'max-w-20' }"
                />
                <UAlert
                  title="计算值进行同步，算法固定. 日薪: /21.75, 时薪: /21.75/8"
                  color="info"
                  :close="false"
                />
                <UButton @click="syncSalaryRange"> 同步 </UButton>
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.H"
                  unit="元/时"
                  :show="true"
                  :step="5"
                  :ui="{ base: 'max-w-20' }"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.D"
                  unit="元/天"
                  :show="true"
                  :step="10"
                  :ui="{ base: 'max-w-20' }"
                />
                <SalaryRangeComponent
                  :value="conf.formData.salaryRange.advancedValue.M"
                  unit="元/月"
                  :show="true"
                  :step="200"
                  :ui="{ base: 'max-w-20' }"
                />
              </div>
            </template>
          </UPopover>
        </RuleRow>

        <RuleRow
          v-if="conf.configLevel.intermediate"
          v-model:enable="conf.formData.companySizeRange.enable"
          :label="formInfoData.companySizeRange.label"
          :help="formInfoData.companySizeRange['data-help']"
          :disabled="disabled"
          verb="需落在"
        >
          <SalaryRangeComponent
            :controls="false"
            :value="conf.formData.companySizeRange.value"
            :label="formInfoData.companySizeRange.label"
            unit="人"
            :show="true"
          />
        </RuleRow>

        <RuleRow
          v-for="rule in toggleRules"
          :key="rule.key"
          v-model:enable="conf.formData[rule.key].value"
          :label="formInfoData[rule.key].label"
          :help="formInfoData[rule.key]['data-help']"
          :disabled="disabled"
          :verb="rule.verb"
        />
      </div>

      <div class="rules-sections">
        <details v-if="conf.configLevel.intermediate" class="rules-section">
          <summary class="rules-section-head">
            <span class="rules-section-chevron" />
            招呼语
            <span class="rules-section-hint">自定义 / 变量模板</span>
            <span class="rules-section-en">GREETING</span>
          </summary>
          <div class="rules-section-body" data-help="自定义招呼语配置">
            <div class="rules-greeting rules-field-wide">
              <UCheckbox
                id="boss-helper-custom-greeting-enabled"
                v-model="conf.formData.customGreeting.enable"
                :aria-label="`启用${formInfoData.customGreeting.label}`"
              />
              <UFormField
                :label="formInfoData.customGreeting.label"
                :data-help="formInfoData.customGreeting['data-help']"
                class="flex-1"
              >
                <UTextarea
                  id="boss-helper-custom-greeting-value"
                  v-model="conf.formData.customGreeting.value"
                  :rows="3"
                  aria-label="自定义招呼语内容"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UCheckbox
              v-if="conf.configLevel.expert"
              v-bind="formInfoData.greetingVariable"
              v-model="conf.formData.greetingVariable.value"
            />
          </div>
        </details>

        <details v-if="conf.configLevel.intermediate" class="rules-section">
          <summary class="rules-section-head">
            <span class="rules-section-chevron" />
            延迟节流
            <span class="rules-section-hint">降低风控风险</span>
            <span class="rules-section-en">THROTTLE</span>
          </summary>
          <div class="rules-section-body rules-grid" data-help="延迟配置">
            <UFormField
              v-for="(item, key) in formInfoData.delay"
              :key="key"
              :label="item.label"
              :data-help="item['data-help']"
            >
              <UInputNumber
                v-model="conf.formData.delay[key]"
                :min="1"
                :max="99999"
                :disabled="item.disable"
              />
            </UFormField>
          </div>
        </details>

        <details class="rules-section">
          <summary class="rules-section-head">
            <span class="rules-section-chevron" />
            外观
            <span class="rules-section-hint">面板位置与聊天框</span>
            <span class="rules-section-en">APPEARANCE</span>
          </summary>
          <div class="rules-section-body">
            <Appearance />
          </div>
        </details>

        <details v-if="conf.configLevel.advanced" class="rules-section">
          <summary class="rules-section-head">
            <span class="rules-section-chevron" />
            通勤距离
            <span class="rules-section-hint">需自备高德 Key</span>
            <span class="rules-section-en">AMAP</span>
          </summary>
          <div class="rules-section-body flex flex-col gap-3" data-help="地址配置">
            <Alert
              id="config-amap-2"
              show-icon
              type="info"
              title="使用高德地图前, 需自行创建key (每日免费配额足够使用)"
              description="推荐结合工作地址包含使用, 创建路径: 创建应用 -> 添加key -> Web服务"
              :actions="[
                {
                  label: '前往创建',
                  color: 'primary',
                  variant: 'subtle',
                  onClick: gotoAmapDevSetting,
                },
              ]"
            />
            <Alert
              id="config-amap-ai"
              :closable="false"
              type="info"
              title="AI Prompt 参考如下语法(仅筛选可用):"
            >
              <template #description>
                <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <span v-pre>直线距离: {{ amap.straightDistance }}km</span>
                  <span v-pre>驾车距离: {{ amap.drivingDistance }}km</span>
                  <span v-pre>驾车时间: {{ amap.drivingDuration }}分钟</span>
                  <span v-pre>步行距离: {{ amap.walkingDistance }}km</span>
                  <span v-pre>步行时间: {{ amap.walkingDuration }}分钟</span>
                </div>
              </template>
            </Alert>
            <div class="flex gap-3 items-center">
              <UCheckbox v-bind="formInfoData.amap.enable" v-model="conf.formData.amap.enable" />
              <UFormField v-bind="formInfoData.amap.key">
                <UInput v-model="conf.formData.amap.key" />
              </UFormField>
            </div>
            <div class="rules-grid">
              <UFormField v-bind="formInfoData.amap.origins">
                <UFieldGroup>
                  <UInput v-model="conf.formData.amap.origins" :disabled="amapGeocodeLoading" />
                  <UButton
                    color="primary"
                    :loading="amapGeocodeLoading"
                    icon="solar:magnifer-bug-outline"
                    title="根据完整地址获取经纬度"
                    @click="amapGeocodeHandler()"
                  />
                </UFieldGroup>
              </UFormField>
              <UFormField v-bind="formInfoData.amap.straightDistance">
                <UFieldGroup>
                  <UInputNumber
                    v-model="conf.formData.amap.straightDistance"
                    :precision="1"
                    :max="1000"
                    :min="0"
                    :step="1"
                  />
                  <UBadge label="km" />
                </UFieldGroup>
              </UFormField>
              <UFormField v-bind="formInfoData.amap.drivingDistance">
                <UFieldGroup>
                  <UInputNumber
                    v-model="conf.formData.amap.drivingDistance"
                    :precision="1"
                    :max="1000"
                    :min="0"
                    :step="1"
                  />
                  <UBadge label="km" />
                </UFieldGroup>
              </UFormField>
              <UFormField v-bind="formInfoData.amap.drivingDuration">
                <UFieldGroup>
                  <UInputNumber
                    v-model="conf.formData.amap.drivingDuration"
                    :precision="2"
                    :max="1440"
                    :min="0"
                    :step="30"
                  />
                  <UBadge label="分钟" />
                </UFieldGroup>
              </UFormField>
              <UFormField v-bind="formInfoData.amap.walkingDistance">
                <UFieldGroup>
                  <UInputNumber
                    v-model="conf.formData.amap.walkingDistance"
                    :precision="1"
                    :max="1000"
                    :min="0"
                    :step="1"
                  />
                  <UBadge label="km" />
                </UFieldGroup>
              </UFormField>
              <UFormField v-bind="formInfoData.amap.walkingDuration">
                <UFieldGroup>
                  <UInputNumber
                    v-model="conf.formData.amap.walkingDuration"
                    :precision="2"
                    :max="1440"
                    :min="0"
                    :step="30"
                  />
                  <UBadge label="分钟" />
                </UFieldGroup>
              </UFormField>
            </div>
          </div>
        </details>

        <details class="rules-section" open>
          <summary class="rules-section-head">
            <span class="rules-section-chevron" />
            执行
            <span class="rules-section-hint">批次、间隔与熔断</span>
            <span class="rules-section-en">EXECUTION</span>
          </summary>
          <div class="rules-section-body">
            <div class="rules-grid">
              <UFormField
                v-if="conf.configLevel.intermediate"
                :label="formInfoData.deliveryLimit.label"
                :data-help="formInfoData.deliveryLimit['data-help']"
              >
                <UInputNumber
                  v-model="conf.formData.deliveryLimit.value"
                  :min="1"
                  :max="155"
                  :step="1"
                />
              </UFormField>
              <UFormField
                v-if="conf.configLevel.intermediate"
                :label="formInfoData.actionDelayMs.label"
                :data-help="formInfoData.actionDelayMs['data-help']"
              >
                <UInputNumber
                  v-model="conf.formData.actionDelayMs.value"
                  :min="1000"
                  :max="120000"
                  :step="1000"
                />
              </UFormField>
              <UFormField
                v-if="conf.configLevel.intermediate"
                :label="formInfoData.maxConsecutiveFailures.label"
                :data-help="formInfoData.maxConsecutiveFailures['data-help']"
              >
                <UInputNumber
                  v-model="conf.formData.maxConsecutiveFailures.value"
                  :min="1"
                  :max="20"
                  :step="1"
                />
              </UFormField>
            </div>
            <div class="rules-checks">
              <UCheckbox
                v-bind="formInfoData.autoApplyEnabled"
                v-model="conf.formData.autoApplyEnabled.value"
              />
              <UCheckbox
                v-bind="formInfoData.autoGreetingEnabled"
                v-model="conf.formData.autoGreetingEnabled.value"
              />
              <UCheckbox
                v-bind="formInfoData.notification"
                v-model="conf.formData.notification.value"
              />
              <UCheckbox
                v-if="conf.configLevel.expert || conf.formData.useCache.value"
                v-bind="formInfoData.useCache"
                v-model="conf.formData.useCache.value"
              />
              <UButton
                v-if="conf.formData.useCache.value"
                color="warning"
                variant="outline"
                size="xs"
                @click="() => getCacheManager().clearCache()"
              >
                清空缓存
              </UButton>
            </div>
          </div>
        </details>
      </div>
    </UForm>

    <div class="rules-savebar" :data-dirty="conf.isDirty.value">
      <span class="rules-savebar-state" role="status" aria-live="polite">
        <span class="rules-savebar-dot" />
        {{ conf.isDirty.value ? '有未保存的配置更改' : '当前配置已保存' }}
      </span>
      <UButton
        color="primary"
        data-help="将当前配置保存到所选预设。"
        :loading="conf.isSaving.value"
        :disabled="conf.isLoading.value || !conf.isDirty.value"
        @click="conf.confSaving"
      >
        保存配置
      </UButton>
      <UButton
        color="neutral"
        variant="outline"
        data-help="重新加载本地配置"
        @click="conf.confReload"
      >
        重载配置
      </UButton>
      <UButton
        color="neutral"
        variant="outline"
        data-help="不同版本的参数可能会调整, 更新之后一键应用, 不会覆盖主要筛选条件"
        @click="conf.confRecommend"
      >
        使用推荐配置
      </UButton>
      <div class="rules-savebar-presets">
        <UFormField
          label="预设"
          data-help="虽然不维护多账号了, 但是预设还是要有的, 这样使用隐身/第三方扩展依旧能多账号使用. 多账号是一件多助人为乐的事呀"
        >
          <UInputMenu
            :model-value="conf.formDataPreset.value"
            :items="conf.formDataPresets.value"
            value-key="value"
            create-item
            :ui="{ content: 'z-50' }"
            :disabled="conf.isLoading.value || conf.isDirty.value"
            @update:model-value="changePreset"
            @create="conf.createPreset"
          />
        </UFormField>
        <UButton
          v-if="conf.configLevel.intermediate"
          color="neutral"
          variant="outline"
          data-help="互联网就是要分享"
          @click="conf.confExport"
        >
          导出
        </UButton>
        <UButton
          v-if="conf.configLevel.intermediate"
          color="neutral"
          variant="outline"
          data-help="互联网就是要分享"
          @click="conf.confImport"
        >
          导入
        </UButton>
        <UButton
          v-if="conf.configLevel.advanced"
          color="error"
          variant="outline"
          data-help="清空配置,不会帮你保存,可以重载恢复"
          @click="conf.confDelete"
        >
          清空配置
        </UButton>
      </div>
    </div>
  </div>
</template>
