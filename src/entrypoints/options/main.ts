import { browser } from 'wxt/browser'

import { storage } from '#imports'

const bossJobsUrl = 'https://www.zhipin.com/web/geek/job'
const bossTabPatterns = ['*://zhipin.com/*', '*://*.zhipin.com/*']

const openButton = document.querySelector<HTMLButtonElement>('#open-boss')
const status = document.querySelector<HTMLElement>('#open-status')
const version = document.querySelector<HTMLElement>('#version')
const diagnosticsList = document.querySelector<HTMLElement>('#diagnostics')

if (version) version.textContent = `v${browser.runtime.getManifest().version}`

openButton?.addEventListener('click', async () => {
  if (!status || !openButton) return
  openButton.disabled = true
  status.textContent = '正在查找已打开的岗位页…'
  try {
    const tabs = await browser.tabs.query({ url: bossTabPatterns })
    const existing = tabs.find((tab) => tab.id != null)
    if (existing?.id != null) {
      await browser.tabs.update(existing.id, { active: true })
      if (existing.windowId != null) {
        await browser.windows.update(existing.windowId, { focused: true })
      }
      status.textContent = '已切换到 BOSS 直聘页面。'
    } else {
      await browser.tabs.create({ url: bossJobsUrl })
      status.textContent = '已打开 BOSS 直聘岗位页。'
    }
  } catch (error) {
    status.textContent = `打开失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    openButton.disabled = false
    void renderDiagnostics()
  }
})

type DiagnosticTone = 'ok' | 'warn' | 'error' | 'pending'

interface Diagnostic {
  label: string
  state: string
  tone: DiagnosticTone
}

interface StoredModel {
  key?: string
  data?: { base_url?: string; api_key?: string; model?: string }
}

interface StoredFormData {
  amap?: { key?: string; enable?: boolean }
}

/**
 * 这一页只报它真的能验证的东西：标签页、本地存储和模型配置的完整度。
 * 内容脚本是否注入成功要在岗位页本身才看得到，所以这里不假装知道。
 */
async function collectDiagnostics(): Promise<Diagnostic[]> {
  const results: Diagnostic[] = []

  try {
    const tabs = await browser.tabs.query({ url: bossTabPatterns })
    results.push(
      tabs.length > 0
        ? { label: 'BOSS 直聘岗位页', state: `已打开 ${tabs.length} 个`, tone: 'ok' }
        : { label: 'BOSS 直聘岗位页', state: '未打开', tone: 'warn' },
    )
  } catch {
    results.push({ label: 'BOSS 直聘岗位页', state: '无法查询', tone: 'error' })
  }

  let formData: StoredFormData | null = null
  try {
    formData = await storage.getItem<StoredFormData>('local:web-geek-job-FormData')
    results.push(
      formData
        ? { label: '本地配置已保存', state: '正常', tone: 'ok' }
        : { label: '本地配置已保存', state: '尚未保存', tone: 'warn' },
    )
  } catch {
    results.push({ label: '本地配置已保存', state: '读取失败', tone: 'error' })
  }

  try {
    const models = (await storage.getItem<StoredModel[]>('local:conf-model')) ?? []
    const ready = models.filter(
      (model) => model.data?.base_url && model.data?.api_key && model.data?.model,
    ).length
    results.push(
      models.length === 0
        ? { label: 'AI 模型连接', state: '未配置', tone: 'warn' }
        : {
            label: 'AI 模型连接',
            state: `${ready} / ${models.length} 已填齐`,
            tone: ready === models.length ? 'ok' : 'warn',
          },
    )
  } catch {
    results.push({ label: 'AI 模型连接', state: '读取失败', tone: 'error' })
  }

  const amapKey = formData?.amap?.key
  results.push({
    label: '高德地图 Key',
    state: amapKey ? '已配置' : '未配置',
    tone: amapKey ? 'ok' : 'pending',
  })

  return results
}

function renderRow({ label, state, tone }: Diagnostic) {
  const row = document.createElement('li')
  row.className = 'diag-row'
  row.dataset.tone = tone

  const dot = document.createElement('span')
  dot.className = 'diag-dot'

  const name = document.createElement('span')
  name.className = 'diag-label'
  name.textContent = label

  const value = document.createElement('span')
  value.className = 'diag-state'
  value.textContent = state

  row.append(dot, name, value)
  return row
}

async function renderDiagnostics() {
  if (!diagnosticsList) return
  const diagnostics = await collectDiagnostics()
  diagnosticsList.replaceChildren(...diagnostics.map(renderRow))
}

void renderDiagnostics()
