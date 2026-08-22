import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import type { App as VueApp } from 'vue'

import * as chat from '@/composables/useModel/test'

import App from './App.vue'
import { HelperContext, HelperKey } from './composables/useHelper'

import AppStyle from '@/assets/main.css?inline'

interface ViewContext {
  disposeView(): void
  suspendView?(trigger?: string): Promise<void>
}

const mountedApps = new WeakMap<HTMLElement, VueApp>()

function mountBossHelperApp(root: HTMLElement, viewContext: ViewContext) {
  const shadow = root.attachShadow({
    mode: __BOSS_HELPER_TEST_OPEN_SHADOW__ ? 'open' : 'closed',
  })
  const style = document.createElement('style')
  style.dataset.bossHelperStyle = 'true'
  style.innerText = AppStyle
  shadow.appendChild(style)

  const container = document.createElement('div')
  container.id = 'app-root'
  container.lang = 'zh-CN'
  shadow.appendChild(container)

  const app = createApp(App)
  app.use(ui)
  app.provide(HelperKey, viewContext as never)
  app.mount(container)
  mountedApps.set(root, app)
}

export function createBossHelperJobElement<C extends HelperContext<C, T, S>, T, S>(
  ctx: HelperContext<C, T, S>,
) {
  const element = document.createElement('boss-helper-job')
  mountBossHelperApp(element, ctx)
  return element
}

export function disposeBossHelperJobElement(element: HTMLElement) {
  mountedApps.get(element)?.unmount()
  mountedApps.delete(element)
  element.remove()
}

export async function run<C extends HelperContext<C, T, S>, T, S>(ctx: HelperContext<C, T, S>) {
  const handlePageHide = (event: PageTransitionEvent) => {
    if (!event.isTrusted && !__BOSS_HELPER_TEST_OPEN_SHADOW__) return
    void ctx.workflow?.suspendForLifecycle(event.persisted ? 'pagehide_bfcache' : 'pagehide')
  }
  window.addEventListener('pagehide', handlePageHide)
  ctx.registerDisposer(() => window.removeEventListener('pagehide', handlePageHide))
  await ctx.onMount()
  logger.info('BossHelper加载成功', chat)
}
