<script lang="ts" setup>
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

import logoUrl from '@/assets/logo.png?inline'
import ChatBox from '@/components/ChatBox.vue'
import JobCards from '@/components/JobCards.vue'
import Version from '@/components/Menu/Version.vue'
import RunBay from '@/components/RunBay.vue'
import Filter from '@/components/Tabs/Filter.vue'
import Statistics from '@/components/Tabs/Statistics.vue'
import { useConf, appearanceConf, crTheme, toggleCrTheme } from '@/composables/conf'
import { ExtStorage } from '@/message'

import { useHelper, VITE_VERSION } from './composables/useHelper'

const Config = defineAsyncComponent(() => import('@/components/Tabs/Config.vue'))
const Ai = defineAsyncComponent(() => import('@/components/Tabs/AI.vue'))
const Logs = defineAsyncComponent(() => import('@/components/Tabs/Logs.vue'))
const About = defineAsyncComponent(() => import('@/components/Tabs/About.vue'))

type TabValue = 'console' | 'rules' | 'ai' | 'logs' | 'about'

const conf = useConf()
const helper = useHelper()
const activeTab = ref<TabValue>('console')
const onboardingComplete = useStorageAsync(
  'local:boss-helper-onboarding-complete',
  false,
  ExtStorage,
)

const theme = crTheme
const toggleTheme = toggleCrTheme

const enabledAiCount = computed(
  () =>
    [conf.formData.aiGreeting, conf.formData.aiFiltering, conf.formData.aiReply].filter(
      (item) => item.enable,
    ).length,
)

const tabs = computed(() => [
  { value: 'console' as const, label: '控制台', badge: '', tone: 'mute' },
  {
    value: 'rules' as const,
    label: '规则',
    badge: conf.isDirty.value ? '未保存' : '',
    tone: 'warn',
  },
  {
    value: 'ai' as const,
    label: 'AI',
    badge: enabledAiCount.value ? String(enabledAiCount.value) : '',
    tone: 'ai',
  },
  {
    value: 'logs' as const,
    label: '日志',
    badge: helper.logs.value.length ? String(helper.logs.value.length) : '',
    tone: 'mute',
  },
  { value: 'about' as const, label: '关于', badge: '', tone: 'mute' },
])

/** 标签栏是自绘的，所以左右方向键的漫游焦点要自己接。 */
function onTabKeydown(event: KeyboardEvent, index: number) {
  const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const total = tabs.value.length
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? total - 1
        : event.key === 'ArrowRight'
          ? (index + 1) % total
          : (index - 1 + total) % total
  const target = tabs.value[next]!.value
  activeTab.value = target
  void nextTick(() => {
    container.value?.querySelector<HTMLButtonElement>(`#boss-helper-tab-${target}`)?.focus()
  })
}

// const externalFilter = ref<HTMLElement>()
const container = ref<HTMLElement>()
const isFeatureEnabled = ref(false)
const helpContent = ref('使用 Tab、鼠标或触控选择界面元素以查看说明。')
const anchor = ref({ x: 0, y: 0 })
const helpTarget = shallowRef<HTMLElement | null>(null)
const helpPinned = ref(false)
const helpVisible = computed(() => isFeatureEnabled.value && helpTarget.value != null)
const managedHelpTargets = new Map<
  HTMLElement,
  { tabindex: string | null; describedBy: string | null }
>()
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
const chatCount = computed(() => helper.chatModel.jobs.value.length)
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

const onboardingSteps = [
  {
    n: 1,
    t: '确认场景',
    d: '仅在自己的账号和允许的范围内使用自动化功能，理解自动投递与自动沟通的风控风险。',
  },
  {
    n: 2,
    t: '检查配置',
    d: '先设置筛选规则，再确认自动投递和招呼语开关，保存后确认显示「当前配置已保存」。',
  },
  {
    n: 3,
    t: '小批试运行',
    d: '从少量岗位开始，随时查看停止原因与日志，确认结果符合预期后再放大批次。',
  },
]

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
    class="shadow-wrapper cr-shell mx-auto mt-10 mb-24 w-full min-w-0 max-w-284"
    :data-cr-theme="theme"
    :class="theme === 'dark' ? 'dark' : undefined"
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
        <!-- BOSS 自带的搜索/筛选条会被搬到这个占位符上方，所以常驻挂载。 -->
        <Filter />

        <div class="cr-panel">
          <header class="cr-head">
            <img class="cr-head-logo" :src="logoUrl" alt="" width="20" height="20" />
            <span class="cr-head-name">
              {{ !appearanceConf.hideHeader ? 'Boss·Helper' : 'Helper' }}
            </span>
            <span class="cr-head-sub">控制室 CONTROL ROOM</span>
            <UChip :show="isDot">
              <UButton color="primary" variant="subtle" size="xs" @click="openStore">
                v{{ VITE_VERSION }}{{ isDot ? ' 有更新' : '' }}
              </UButton>
            </UChip>
            <button
              type="button"
              class="cr-b cr-head-theme"
              :aria-label="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
              data-help="控制室配色，深浅两套主题共用同一份变量。"
              @click="toggleTheme"
            >
              {{ theme === 'dark' ? '☀ 浅色' : '☾ 深色' }}
            </button>
          </header>

          <RunBay />

          <div class="cr-tabbar">
            <div class="cr-tabbar-list" role="tablist" aria-label="控制室面板" data-help="no-help">
              <button
                v-for="(tab, index) in tabs"
                :key="tab.value"
                type="button"
                class="cr-nav cr-tab"
                role="tab"
                :id="`boss-helper-tab-${tab.value}`"
                :aria-selected="activeTab === tab.value"
                :aria-controls="`boss-helper-panel-${tab.value}`"
                :tabindex="activeTab === tab.value ? 0 : -1"
                :data-active="activeTab === tab.value"
                @click="activeTab = tab.value"
                @keydown="onTabKeydown($event, index)"
              >
                {{ tab.label }}
                <span v-if="tab.badge" class="cr-badge" :data-tone="tab.tone">{{ tab.badge }}</span>
              </button>
            </div>
            <div class="cr-tabbar-actions">
              <button
                type="button"
                class="cr-b cr-action cr-action-accent"
                :aria-pressed="chatOpen"
                data-help="打开对话抽屉，查看 HR 消息并编辑 AI 回复草稿。"
                @click.stop="chatOpen = !chatOpen"
              >
                对话
                <span v-if="chatCount" class="cr-action-count">{{ chatCount }}</span>
              </button>
              <button
                v-if="helper.netConf.value?.feedback"
                type="button"
                class="cr-b cr-action"
                @click.stop="tagOpen(helper.netConf.value.feedback)"
              >
                反馈
              </button>
              <button
                type="button"
                class="cr-b cr-action"
                :aria-pressed="isFeatureEnabled"
                :style="
                  isFeatureEnabled
                    ? { borderColor: 'var(--cr-acc)', color: 'var(--cr-acc)' }
                    : undefined
                "
                @click="isFeatureEnabled = !isFeatureEnabled"
              >
                帮助
              </button>
              <button
                type="button"
                class="cr-b cr-action"
                data-help="重新打开首次使用清单。"
                @click="onboardingComplete = false"
              >
                使用指南
              </button>
            </div>
          </div>

          <div
            v-if="isFeatureEnabled"
            id="boss-helper-help-status"
            role="status"
            aria-live="polite"
            class="cr-help-banner"
          >
            <span class="cr-help-dot" />
            帮助：{{ helpContent }}（悬停或用 Tab 聚焦控件查看说明，按 Esc 关闭）
          </div>

          <div v-if="helper.netConf.value?.notification" class="netAlerts cr-net-alerts">
            <template
              v-for="item in helper.netConf.value.notification.filter(
                (item) => item.type === 'alert',
              )"
              :key="item.key ?? item.data.title"
            >
              <Alert :id="`netConf-${item.key}`" v-bind="item.data" />
            </template>
          </div>

          <div class="cr-body">
            <div
              v-show="activeTab === 'console'"
              id="boss-helper-panel-console"
              role="tabpanel"
              aria-labelledby="boss-helper-tab-console"
            >
              <Statistics @navigate="activeTab = $event" />
            </div>
            <div
              v-if="activeTab === 'rules'"
              id="boss-helper-panel-rules"
              role="tabpanel"
              aria-labelledby="boss-helper-tab-rules"
            >
              <Config />
            </div>
            <div
              v-if="activeTab === 'ai'"
              id="boss-helper-panel-ai"
              role="tabpanel"
              aria-labelledby="boss-helper-tab-ai"
            >
              <Ai />
            </div>
            <div
              v-if="activeTab === 'logs'"
              id="boss-helper-panel-logs"
              role="tabpanel"
              aria-labelledby="boss-helper-tab-logs"
            >
              <Logs />
            </div>
            <div
              v-if="activeTab === 'about'"
              id="boss-helper-panel-about"
              role="tabpanel"
              aria-labelledby="boss-helper-tab-about"
            >
              <About />
            </div>
          </div>
        </div>
      </div>
      <JobCards />
      <ChatBox v-model:open="chatOpen" />

      <UModal
        :open="!onboardingComplete"
        title="开始前，先过一遍这三件事"
        description="首次使用 · Safety checklist"
        :dismissible="false"
        :ui="{ content: 'sm:max-w-[560px]' }"
        @update:open="onboardingComplete = true"
      >
        <template #content>
          <section class="cr-onboard" aria-labelledby="boss-helper-onboarding-title">
            <span class="cr-hazard cr-onboard-stripe" />
            <div class="cr-onboard-body">
              <div>
                <span class="cr-onboard-eyebrow">首次使用 · Safety checklist</span>
                <h2 id="boss-helper-onboarding-title" class="cr-onboard-title">
                  开始前，先过一遍这三件事
                </h2>
              </div>
              <ol class="cr-onboard-steps">
                <li v-for="step in onboardingSteps" :key="step.n">
                  <span class="cr-onboard-num">{{ step.n }}</span>
                  <div>
                    <p class="cr-onboard-step-title">{{ step.t }}</p>
                    <p class="cr-onboard-step-desc">{{ step.d }}</p>
                  </div>
                </li>
              </ol>
              <div class="cr-onboard-actions">
                <button
                  type="button"
                  class="cr-b cr-onboard-primary"
                  @click="onboardingComplete = true"
                >
                  我已了解，开始配置
                </button>
                <button
                  type="button"
                  class="cr-b cr-onboard-secondary"
                  @click="onboardingComplete = true"
                >
                  稍后
                </button>
              </div>
            </div>
          </section>
        </template>
      </UModal>
    </UApp>
  </div>
</template>
