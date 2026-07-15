<script lang="ts" setup>
import { TabsItem } from '@nuxt/ui'
import { useStorageAsync } from '@vueuse/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'

import ChatBox from '@/components/ChatBox.vue'
import JobCards from '@/components/JobCards.vue'
import Version from '@/components/Menu/Version.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import { useConf, appearanceConf } from '@/composables/conf'
import { ExtStorage } from '@/message'

import { useHelper, VITE_VERSION } from './composables/useHelper'

const Config = defineAsyncComponent(() => import('@/components/Tabs/Config.vue'))
const Ai = defineAsyncComponent(() => import('@/components/Tabs/AI.vue'))
const Logs = defineAsyncComponent(() => import('@/components/Tabs/Logs.vue'))
const About = defineAsyncComponent(() => import('@/components/Tabs/About.vue'))

const conf = useConf()
const helper = useHelper()
const activeTab = ref('statistics')
const onboardingComplete = useStorageAsync(
  'local:boss-helper-onboarding-complete',
  false,
  ExtStorage,
)

const items = computed<TabsItem[]>(() => {
  const configs = [
    { value: 'statistics', slot: 'statistics', label: '统计', help: '失败是成功她妈' },
    { value: 'filter', slot: 'filter', label: '筛选' },
    {
      value: 'config',
      slot: 'config',
      label: conf.isDirty.value ? '配置（未保存）' : '配置',
      help: '好好看，好好学',
    },
    { value: 'ai', slot: 'ai', label: 'AI', help: 'AI时代，脚本怎么能落伍!' },
    { value: 'logs', slot: 'logs', label: '日志', help: '反正你也不看' },
    {
      value: 'about',
      slot: 'about',
      label: '关于&赞赏',
      help: '项目是写不完美的,但总要去追求完美',
    },
  ] satisfies (TabsItem | boolean | null | undefined | '')[]

  return configs.filter((item) => !!item) as TabsItem[]
})

// const externalFilter = ref<HTMLElement>()
const container = ref<HTMLElement>()
const isFeatureEnabled = ref(false)
const helpContent = ref('使用 Tab、鼠标或触控选择界面元素以查看说明。')
const anchor = ref({ x: 0, y: 0 })
const helpTarget = shallowRef<HTMLElement | null>(null)
const helpPinned = ref(false)
const helpVisible = computed(() => isFeatureEnabled.value && helpTarget.value != null)
const managedHelpTargets = new Map<HTMLElement, { tabindex: string | null; describedBy: string | null }>()
let helpTargetObserver: MutationObserver | null = null
const boxStyles = shallowRef({
  display: 'none',
  width: '0px',
  height: '0px',
  transform: 'translate(0, 0)',
})

const reference = computed(() => ({
  getBoundingClientRect: () =>
    ({
      width: 0,
      height: 0,
      left: anchor.value.x,
      right: anchor.value.x,
      top: anchor.value.y,
      bottom: anchor.value.y,
    }) as DOMRect,
}))

function showHelp(el: HTMLElement | null, point?: { x: number; y: number }) {
  const help = el?.dataset.help || ''
  if (!el || help === 'no-help') {
    if (!helpPinned.value) clearHelp()
    return
  }

  const rect = el.getBoundingClientRect()
  helpTarget.value = el
  helpContent.value = help
  anchor.value = point ?? { x: rect.left + rect.width / 2, y: rect.top }

  boxStyles.value = {
    display: 'block',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate(${rect.left}px, ${rect.top}px)`,
  }
}

function clearHelp() {
  helpTarget.value = null
  helpPinned.value = false
  boxStyles.value = { ...boxStyles.value, display: 'none' }
}

function findHelpTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>('[data-help]') : null
}

function restoreHelpTargets() {
  for (const [element, attributes] of managedHelpTargets) {
    if (attributes.tabindex == null) element.removeAttribute('tabindex')
    else element.setAttribute('tabindex', attributes.tabindex)
    if (attributes.describedBy == null) element.removeAttribute('aria-describedby')
    else element.setAttribute('aria-describedby', attributes.describedBy)
  }
  managedHelpTargets.clear()
}

function syncHelpTargets() {
  if (!isFeatureEnabled.value) return
  const targets = new Set(
    container.value?.querySelectorAll<HTMLElement>('[data-help]:not([data-help="no-help"])') ?? [],
  )

  for (const [element, attributes] of managedHelpTargets) {
    if (targets.has(element)) continue
    if (attributes.tabindex == null) element.removeAttribute('tabindex')
    else element.setAttribute('tabindex', attributes.tabindex)
    if (attributes.describedBy == null) element.removeAttribute('aria-describedby')
    else element.setAttribute('aria-describedby', attributes.describedBy)
    managedHelpTargets.delete(element)
  }

  for (const element of targets) {
    if (managedHelpTargets.has(element)) continue
    managedHelpTargets.set(element, {
      tabindex: element.getAttribute('tabindex'),
      describedBy: element.getAttribute('aria-describedby'),
    })
    if (!element.matches('a,button,input,select,textarea,[tabindex]')) element.tabIndex = 0
    const existing = element.getAttribute('aria-describedby')
    element.setAttribute(
      'aria-describedby',
      [existing, 'boss-helper-help-status'].filter(Boolean).join(' '),
    )
  }
}

async function prepareHelpTargets() {
  await nextTick()
  syncHelpTargets()
}

watch(isFeatureEnabled, (enabled) => {
  if (!enabled) {
    clearHelp()
    restoreHelpTargets()
    return
  }
  void prepareHelpTargets()
})
watch(activeTab, () => void prepareHelpTargets())

const chatOpen = ref(appearanceConf.value.defaultShowChatBox)
const batchSubmitted = computed(() => helper.workflow?.batchSubmitted.value ?? 0)
const batchLimit = computed(
  () => helper.workflow?.batchLimit.value ?? conf.formData.deliveryLimit.value,
)
const panelMaxWidth = computed(() =>
  appearanceConf.value.contentOffset !== 25
    ? `calc(${100 - appearanceConf.value.contentOffset}vw - 2rem)`
    : 'calc(100vw - 2rem)',
)

onMounted(async () => {
  window.addEventListener('beforeunload', warnAboutUnsavedConfiguration)
  helpTargetObserver = new MutationObserver(syncHelpTargets)
  if (container.value) {
    helpTargetObserver.observe(container.value, { childList: true, subtree: true })
  }
  await helper.ensureInitialized().catch(() => undefined)
  chatOpen.value = appearanceConf.value.defaultShowChatBox
})

function warnAboutUnsavedConfiguration(event: BeforeUnloadEvent) {
  if (!conf.isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function tagOpen(url: string) {
  window.open(url)
}

const isDot = computed(() => {
  return (helper.netConf.value?.version ?? '0') > VITE_VERSION
})

const overlay = useOverlay()

function openStore() {
  overlay
    .create(Version, {
      destroyOnClose: true,
    })
    .open()
}

function onPointerMove(ev: PointerEvent) {
  if (!isFeatureEnabled.value || helpPinned.value) return
  showHelp(findHelpTarget(ev.target), { x: ev.clientX, y: ev.clientY })
}

function onPointerDown(ev: PointerEvent) {
  if (!isFeatureEnabled.value || ev.pointerType === 'mouse') return
  const target = findHelpTarget(ev.target)
  if (!target) return
  helpPinned.value = true
  showHelp(target)
}

function onFocusIn(ev: FocusEvent) {
  if (!isFeatureEnabled.value) return
  showHelp(findHelpTarget(ev.target))
}

function onFocusOut(ev: FocusEvent) {
  if (!isFeatureEnabled.value || helpPinned.value) return
  if (!findHelpTarget(ev.relatedTarget)) clearHelp()
}

function onHelpKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && helpVisible.value) {
    ev.stopPropagation()
    clearHelp()
  }
}

onBeforeUnmount(() => {
  helpTargetObserver?.disconnect()
  helpTargetObserver = null
  restoreHelpTargets()
  window.removeEventListener('beforeunload', warnAboutUnsavedConfiguration)
})
</script>

<template>
  <div
    class="shadow-wrapper mx-auto mt-10 mb-24 w-full min-w-0 max-w-284"
    :style="{
      maxWidth: panelMaxWidth,
      marginRight:
        appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
      marginLeft:
        !appearanceConf.leftChat && appearanceConf.contentOffset != 25
          ? `${appearanceConf.contentOffset}%`
          : undefined,
    }"
    ref="container"
  >
    <UApp :portal="container" :toaster="{ position: 'top-right', ui: { viewport: 'z-100000' } }">
      <div class="overlay-box" :style="boxStyles" />
      <UTooltip
        :open="helpVisible"
        :reference="reference"
        :content="{
          side: 'top',
          sideOffset: 20,
          updatePositionStrategy: 'always',
        }"
        :text="helpContent"
        :ui="{
          content:
            'z-1000 flex items-center gap-1 bg-default text-highlighted shadow-xl rounded-md ring-1 ring-default h-auto px-3 py-2 text-[17px] leading-snug select-none pointer-events-auto backdrop-blur-none opacity-100 wrap-break-word',
          text: 'whitespace-normal',
        }"
      />
      <div
        @pointermove.passive="onPointerMove"
        @pointerdown="onPointerDown"
        @pointerleave="helpPinned || clearHelp()"
        @focusin="onFocusIn"
        @focusout="onFocusOut"
        @keydown="onHelpKeydown"
      >
        <div class="rounded-xl pt-3 pb-6 px-4 bg-default flex flex-col">
          <div class="flex flex-wrap gap-2 items-center">
            <span class="text-xl">{{ !appearanceConf.hideHeader ? 'Boss-Helper' : 'Helper' }}</span>
            <UChip :show="isDot">
              <UButton color="primary" variant="subtle" @click="openStore" size="xs">
                v{{ VITE_VERSION }} {{ isDot ? ' 有更新' : '' }}
              </UButton>
            </UChip>
            <span v-if="helper.workflow" style="margin-right: 15px">
              本批投递: {{ batchSubmitted }}/{{ batchLimit }}
            </span>
            <span v-if="helper.workflow && helper.workflow.total.value > 0">
              当前页面处理: {{ helper.workflow.current.value + 1 }}/{{
                helper.workflow.total.value
              }}
            </span>
            <span
              v-if="conf.isDirty.value"
              role="status"
              class="rounded-md bg-warning/15 px-2 py-1 text-sm font-medium text-warning"
            >
              配置有未保存更改
            </span>
            <UButton
              class="ml-auto"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="onboardingComplete = false"
            >
              使用指南
            </UButton>
          </div>

          <section
            v-if="!onboardingComplete"
            aria-labelledby="boss-helper-onboarding-title"
            class="mt-3 rounded-md border border-primary/30 bg-primary/5 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="boss-helper-onboarding-title" class="font-semibold text-default">
                  首次安全使用清单
                </h2>
                <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
                  <li>确认当前是你自己的 BOSS 账号，并理解自动投递和自动沟通风险。</li>
                  <li>先在“筛选”和“配置”中检查规则，保存后确认页面显示“当前配置已保存”。</li>
                  <li>从较小的每批数量开始，观察岗位状态、停止原因和日志后再继续。</li>
                </ol>
              </div>
              <UButton color="primary" variant="soft" @click="onboardingComplete = true">
                我已了解
              </UButton>
            </div>
          </section>

          <div v-if="helper.netConf.value && helper.netConf.value.notification" class="netAlerts">
            <template
              v-for="item in helper.netConf.value.notification.filter(
                (item) => item.type === 'alert',
              )"
              :key="item.key ?? item.data.title"
            >
              <Alert :id="`netConf-${item.key}`" v-bind="item.data" />
            </template>
          </div>
          <UTabs
            v-model="activeTab"
            data-help="no-help"
            :items="items"
            variant="link"
            :ui="{ list: 'items-center flex-wrap gap-y-1' }"
            :unmount-on-hide="true"
          >
            <template #statistics>
              <Statistics @navigate="activeTab = $event" />
            </template>
            <template #filter>
              <Filter />
            </template>
            <template #config><Config /></template>
            <template #ai><Ai /></template>
            <template #logs><Logs /></template>
            <template #about><About /></template>
            <template #list-trailing>
              <UButton
                class="ml-2"
                size="xs"
                color="primary"
                :aria-pressed="chatOpen"
                @click.stop="chatOpen = !chatOpen"
              >
                对话
              </UButton>
              <UButton
                v-if="helper.netConf.value?.feedback"
                class="ml-2"
                size="xs"
                color="info"
                @click.stop="tagOpen(helper.netConf.value.feedback)"
              >
                反馈
              </UButton>
              <UCheckbox
                class="ml-2"
                size="md"
                color="neutral"
                v-model="isFeatureEnabled"
                label="帮助"
              />
            </template>
          </UTabs>
          <p
            v-if="isFeatureEnabled"
            id="boss-helper-help-status"
            role="status"
            aria-live="polite"
            class="mt-3 rounded-md bg-elevated px-3 py-2 text-sm text-muted"
          >
            帮助：{{ helpContent }}（按 Esc 关闭当前触控说明）
          </p>
        </div>
      </div>
      <JobCards />
      <ChatBox v-model:open="chatOpen" />
    </UApp>
  </div>
</template>
