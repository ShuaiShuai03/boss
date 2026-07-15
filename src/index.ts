import ui from '@nuxt/ui/vue-plugin'
import { createApp } from 'vue'
import type { App as VueApp, Component } from 'vue'

import * as chat from '@/composables/useModel/test'

import App from './App.vue'
import AppMenu from './AppMenu.vue'
import { HelperContext, HelperKey } from './composables/useHelper'

import AppStyle from '@/assets/main.css?inline'

interface ViewContext {
  disposeView(): void
  suspendView?(trigger?: string): Promise<void>
}

const viewContextSymbol = Symbol.for('boss-helper:view-context')

export function createBossHelperJobElement<C extends HelperContext<C, T, S>, T, S>(
  ctx: HelperContext<C, T, S>,
) {
  const element = document.createElement('boss-helper-job')
  Object.defineProperty(element, viewContextSymbol, {
    configurable: true,
    value: ctx,
  })
  return element
}

export async function run<C extends HelperContext<C, T, S>, T, S>(ctx: HelperContext<C, T, S>) {
  function mountApp(root: HTMLElement, component: Component, viewContext: ViewContext) {
    const shadow = root.shadowRoot ?? root.attachShadow({ mode: 'open' })
    let style = shadow.querySelector<HTMLStyleElement>('style[data-boss-helper-style]')
    if (!style) {
      style = document.createElement('style')
      style.dataset.bossHelperStyle = 'true'
      style.innerText = AppStyle
      shadow.appendChild(style)
    }

    let container = shadow.querySelector<HTMLDivElement>('#app-root')
    if (!container) {
      container = document.createElement('div')
      container.id = 'app-root'
      container.lang = 'zh-CN'
      shadow.appendChild(container)
    }

    const app = createApp(component)
    app.use(ui)
    app.provide(HelperKey, viewContext as never)
    app.mount(container)
    return app
  }

  if (!customElements.get('boss-helper-job')) {
    customElements.define(
      'boss-helper-job',
      class extends HTMLElement {
        private app: VueApp | null = null
        private viewContext: ViewContext | null = null

        connectedCallback() {
          if (this.app) return
          this.viewContext =
            ((this as unknown as Record<symbol, ViewContext>)[viewContextSymbol] as
              | ViewContext
              | undefined) ?? ctx
          this.app = mountApp(this, App, this.viewContext)
        }

        disconnectedCallback() {
          this.app?.unmount()
          this.app = null
          if (this.viewContext?.suspendView) {
            void this.viewContext.suspendView('view_disconnected')
          } else {
            this.viewContext?.disposeView()
          }
          this.viewContext = null
        }
      },
    )
  }

  if (!customElements.get('boss-helper-menu')) {
    customElements.define(
      'boss-helper-menu',
      class extends HTMLElement {
        private app: VueApp | null = null

        connectedCallback() {
          if (!this.app) this.app = mountApp(this, AppMenu, ctx)
        }

        disconnectedCallback() {
          this.app?.unmount()
          this.app = null
        }
      },
    )
  }

  const handlePageHide = (event: PageTransitionEvent) => {
    void ctx.workflow?.suspendForLifecycle(event.persisted ? 'pagehide_bfcache' : 'pagehide')
  }
  window.addEventListener('pagehide', handlePageHide)
  ctx.registerDisposer(() => window.removeEventListener('pagehide', handlePageHide))
  await ctx.onMount()
  logger.info('BossHelper加载成功', chat)
}
