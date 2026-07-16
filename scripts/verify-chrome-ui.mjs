import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const extensionPath = fileURLToPath(new URL('../.output/chrome-mv3/', import.meta.url))
await access(path.join(extensionPath, 'manifest.json'))

const profilePath = await mkdtemp(path.join(tmpdir(), 'boss-helper-chromium-'))
const browserErrors = []
const expectedFailureConsoleErrors = []
const bossChunkRequests = new Set()
let context
let lifecycleSubmissionRequests = 0
let holdLifecycleSubmission = false
let releaseLifecycleSubmission

function fixtureHtml({ contact = true } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>BossHelper isolated fixture</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-width: 0; }
      .job-search-wrapper, .recommend-result-inner, .page-job-wrapper { min-width: 0; width: 100%; }
    </style>
  </head>
  <body>
    <div id="wrap">
      <main class="job-search-wrapper">
        <div class="recommend-result-inner"></div>
        <div class="page-job-wrapper"></div>
      </main>
    </div>
    <script>
      (() => {
        window.Cookie = { get: () => 'fixture-token' }
        const aiReplyEvent = 'boss-helper:ai-reply-message'
        const aiReplyListeners = new Set()
        const activeIntervals = new Map()
        const originalAddEventListener = document.addEventListener.bind(document)
        const originalRemoveEventListener = document.removeEventListener.bind(document)
        const originalSetInterval = window.setInterval.bind(window)
        const originalClearInterval = window.clearInterval.bind(window)

        document.addEventListener = (type, listener, options) => {
          if (type === aiReplyEvent) aiReplyListeners.add(listener)
          return originalAddEventListener(type, listener, options)
        }
        document.removeEventListener = (type, listener, options) => {
          if (type === aiReplyEvent) aiReplyListeners.delete(listener)
          return originalRemoveEventListener(type, listener, options)
        }
        window.setInterval = (handler, timeout, ...args) => {
          const id = originalSetInterval(handler, timeout, ...args)
          activeIntervals.set(id, {
            timeout,
            stack: new Error('setInterval').stack,
          })
          return id
        }
        window.clearInterval = (id) => {
          activeIntervals.delete(id)
          return originalClearInterval(id)
        }

        const job = {
          securityId: 'fixture-security',
          bossAvatar: '',
          bossCert: 1,
          encryptBossId: 'fixture-boss',
          bossName: '测试招聘者',
          bossTitle: '招聘经理',
          goldHunter: 0,
          bossOnline: true,
          encryptJobId: 'fixture-job',
          expectId: 1,
          jobName: '前端工程师 Fixture',
          lid: 'fixture-lid',
          salaryDesc: '20-30K',
          jobLabels: ['3-5年', '本科'],
          jobValidStatus: 1,
          iconWord: '',
          skills: ['Vue', 'TypeScript'],
          jobExperience: '3-5年',
          daysPerWeekDesc: '',
          leastMonthDesc: '',
          jobDegree: '本科',
          cityName: '北京',
          areaDistrict: '朝阳区',
          businessDistrict: '望京',
          jobType: 0,
          proxyJob: 0,
          proxyType: 0,
          anonymous: 0,
          outland: 0,
          optimal: 0,
          itemId: 1,
          city: 101010100,
          isShield: 0,
          atsDirectPost: false,
          gps: { longitude: 116.4, latitude: 39.9 },
          afterNameIcons: [],
          beforeNameIcons: [],
          lastModifyTime: Date.now(),
          encryptBrandId: 'fixture-brand',
          brandName: 'Fixture 科技',
          brandLogo: '',
          brandStageName: 'A轮',
          brandIndustry: '互联网',
          brandScaleName: '100-499人',
          welfareList: ['双休', '五险一金'],
          industry: 100020,
          contact: ${contact},
          showTopPosition: false,
        }
        const detail = {
          pageType: 0,
          selfAccess: false,
          securityId: job.securityId,
          sessionId: null,
          lid: job.lid,
          jobInfo: {
            encryptId: job.encryptJobId,
            encryptUserId: job.encryptBossId,
            invalidStatus: false,
            jobName: job.jobName,
            position: 100101,
            positionName: job.jobName,
            location: 101010100,
            locationName: '北京',
            locationUrl: '',
            experienceName: job.jobExperience,
            degreeName: job.jobDegree,
            jobType: 0,
            proxyJob: 0,
            proxyType: 0,
            salaryDesc: job.salaryDesc,
            payTypeDesc: null,
            postDescription: '负责 Vue 与 TypeScript 项目开发，维护可访问的前端界面。',
            encryptAddressId: 'fixture-address',
            address: '北京市朝阳区望京',
            longitude: 116.4,
            latitude: 39.9,
            staticMapUrl: '',
            pcStaticMapUrl: '',
            baiduStaticMapUrl: '',
            baiduPcStaticMapUrl: '',
            overseasAddressList: [],
            overseasInfo: null,
            showSkills: job.skills,
            anonymous: 0,
            jobStatusDesc: '最新',
          },
          bossInfo: {
            name: job.bossName,
            title: job.bossTitle,
            tiny: '',
            large: '',
            activeTimeDesc: '今日活跃',
            bossOnline: true,
            brandName: job.brandName,
            bossSource: 0,
            certificated: true,
            tagIconUrl: null,
            avatarStickerUrl: null,
          },
          brandComInfo: {
            encryptBrandId: job.encryptBrandId,
            brandName: job.brandName,
            logo: '',
            stage: 1,
            stageName: job.brandStageName,
            scale: 304,
            scaleName: job.brandScaleName,
            industry: job.industry,
            industryName: job.brandIndustry,
            introduce: 'Fixture company',
            labels: [],
            activeTime: Date.now(),
            visibleBrandInfo: true,
            focusBrand: false,
            customerBrandName: job.brandName,
            customerBrandStageName: job.brandStageName,
          },
          oneKeyResumeInfo: {
            inviteType: 0,
            alreadySend: false,
            canSendResume: false,
            canSendPhone: false,
            canSendWechat: false,
          },
          relationInfo: { interestJob: false, beFriend: false },
          handicappedInfo: null,
          appendixInfo: { canFeedback: false, chatBubble: null },
          atsOnlineApplyInfo: { inviteType: 0, alreadyApply: false },
          certMaterials: [],
        }

        const jobComponent = document.querySelector('.page-job-wrapper')
        const componentState = {
          jobList: [job],
          pageVo: { page: 1, pageSize: 15 },
          hasMore: false,
          jobDetail: detail,
          pageChangeAction() {},
          searchJobAction() {},
          onSearch() {},
          clickJobCardAction() {
            window.__bossFixture.detailSelections += 1
            componentState.jobDetail = detail
          },
        }
        Object.defineProperty(jobComponent, '__vue__', { configurable: true, value: componentState })

        const rootVue = {
          $route: { path: '/web/geek/jobs' },
          $router: { afterHooks: [] },
          $store: {
            state: {
              userInfo: {
                uid: '10001',
                encryptUserId: 'fixture-user',
                showName: 'Fixture User',
                tinyAvatar: '',
              },
            },
          },
        }
        Object.defineProperty(document.querySelector('#wrap'), '__vue__', {
          configurable: true,
          value: rootVue,
        })
        window._PAGE = rootVue.$store.state.userInfo
        window.__bossFixture = {
          detailSelections: 0,
          job,
          resources() {
            return {
              aiReplyListeners: aiReplyListeners.size,
              intervals: activeIntervals.size,
              intervalDetails: [...activeIntervals.values()],
              routeHooks: rootVue.$router.afterHooks.length,
              hosts: document.querySelectorAll('boss-helper-job').length,
              hookedDataKeys: ['jobList', 'pageVo', 'hasMore', 'jobDetail'].filter(
                (key) => typeof Object.getOwnPropertyDescriptor(componentState, key)?.set === 'function',
              ).length,
            }
          },
          navigate() {
            const route = {
              name: 'fixture',
              path: '/web/geek/jobs',
              fullPath: '/web/geek/jobs',
              hash: '',
              query: {},
              params: {},
              meta: {},
            }
            for (const hook of [...rootVue.$router.afterHooks]) hook(route)
            document.querySelector('boss-helper-job')?.remove()
          },
          replaceJobsAfterRemount() {
            componentState.jobList = [
              {
                ...job,
                encryptJobId: 'fixture-job-remounted',
                jobName: '重挂后岗位 Fixture',
              },
            ]
          },
          dispatchConversation(messageId = 'fixture-message') {
            const peer = { uid: '20002', name: '测试招聘者', source: 0 }
            document.dispatchEvent(new CustomEvent(aiReplyEvent, {
              detail: {
                url: location.href,
                user: { uid: '10001', name: 'Fixture User' },
                messages: [{
                  id: messageId,
                  conversationId: 'fixture-conversation',
                  direction: 'incoming',
                  text: '你好，可以介绍一下项目经验吗？',
                  timestamp: Date.now(),
                  sender: peer,
                  recipient: { uid: '10001', name: 'Fixture User' },
                  peer,
                  job: {
                    key: 'boss::fixture-job',
                    link: 'https://www.zhipin.com/job_detail/fixture-job.html',
                    jobName: job.jobName,
                    positionName: job.jobName,
                    jobDescription: detail.jobInfo.postDescription,
                    experienceName: job.jobExperience,
                    degreeName: job.jobDegree,
                    salary: job.salaryDesc,
                    address: '北京-朝阳区-望京',
                    skills: job.skills,
                    showSkills: job.skills,
                    jobLabels: job.jobLabels,
                    welfareList: job.welfareList,
                    boss: { name: job.bossName, title: job.bossTitle, isFriend: false },
                    brand: { name: job.brandName, labels: [] },
                  },
                }],
              },
            }))
          },
        }
      })()
    </script>
  </body>
</html>`
}

function trackPage(page) {
  page.on('pageerror', (error) => browserErrors.push(`${page.url()}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const error = `${page.url()}: ${message.text()}`
    if (
      page.url().includes('boss-helper-fixture=failure') &&
      message.text().includes('AI 模型配置加载失败')
    ) {
      expectedFailureConsoleErrors.push(error)
      return
    }
    browserErrors.push(error)
  })
  page.on('request', (request) => {
    if (/\/chunks\/boss-[^/]+\.js(?:$|\?)/.test(request.url())) {
      bossChunkRequests.add(request.url())
    }
  })
}

function trackWorker(worker) {
  worker.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${worker.url()}: ${message.text()}`)
  })
}

function waitForServiceWorkerVersion(session, predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.off('ServiceWorker.workerVersionUpdated', handleVersions)
      reject(new Error('Timed out waiting for service worker state'))
    }, timeoutMs)
    const handleVersions = ({ versions }) => {
      const candidate = versions.find(predicate)
      if (!candidate) return
      clearTimeout(timeout)
      session.off('ServiceWorker.workerVersionUpdated', handleVersions)
      resolve(candidate)
    }
    session.on('ServiceWorker.workerVersionUpdated', handleVersions)
  })
}

async function restartServiceWorker(context, page, scriptUrl, wake) {
  const session = await context.newCDPSession(page)
  try {
    const initialVersionPromise = waitForServiceWorkerVersion(
      session,
      (item) => item.scriptURL === scriptUrl && item.runningStatus === 'running',
    )
    await session.send('ServiceWorker.enable')
    const version = await initialVersionPromise
    await session.send('ServiceWorker.stopWorker', { versionId: version.versionId })
    const restartedVersionPromise = waitForServiceWorkerVersion(
      session,
      (item) => item.scriptURL === scriptUrl && item.runningStatus === 'running',
    )
    await wake()
    await restartedVersionPromise
  } finally {
    await session.detach()
  }
}

async function extensionStorage(worker, area, operation, value) {
  return worker.evaluate(
    async ({ area, operation, value }) => {
      const storageArea = chrome.storage[area]
      if (operation === 'clear') return storageArea.clear()
      if (operation === 'get') return storageArea.get(value)
      if (operation === 'set') return storageArea.set(value)
      throw new Error(`Unsupported storage operation: ${operation}`)
    },
    { area, operation, value },
  )
}

async function resetStorage(worker, local = {}, sync = {}, session = {}) {
  await Promise.all([
    extensionStorage(worker, 'local', 'clear'),
    extensionStorage(worker, 'sync', 'clear'),
    extensionStorage(worker, 'session', 'clear'),
  ])
  await Promise.all([
    extensionStorage(worker, 'local', 'set', local),
    extensionStorage(worker, 'sync', 'set', sync),
    extensionStorage(worker, 'session', 'set', session),
  ])
}

function localDateKey(currentDate = new Date()) {
  const year = currentDate.getFullYear()
  const month = String(currentDate.getMonth() + 1).padStart(2, '0')
  const day = String(currentDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function waitForBossUi(page) {
  await page.waitForSelector('boss-helper-job')
  const host = page.locator('boss-helper-job')
  await host.getByText('Boss-Helper', { exact: true }).waitFor()
  return host
}

async function waitForStorage(worker, area, key, predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const stored = await extensionStorage(worker, area, 'get', key)
    if (predicate(stored[key])) return stored[key]
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${area} storage key ${key}`)
}

async function waitForContextPage(context, predicate, timeoutMs = 5000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const page = context.pages().find((candidate) => !candidate.isClosed() && predicate(candidate))
    if (page) return page
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for the expected browser page')
}

async function waitForCondition(predicate, label, timeoutMs = 10_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function assertNoPageOverflow(page, width, label) {
  await page.setViewportSize({ width, height: 900 })
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    hostRight: document.querySelector('boss-helper-job')?.getBoundingClientRect().right ?? 0,
  }))
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth + 1,
    `Page overflows for ${label}: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
  )
  assert.ok(
    overflow.hostRight <= overflow.clientWidth + 1,
    `BossHelper host is clipped for ${label}`,
  )
}

function requestedBossChunks() {
  return [...bossChunkRequests]
}

async function auditControls(page) {
  return page.locator('boss-helper-job').evaluate((host) => {
    const root = host.shadowRoot
    if (!root) throw new Error('BossHelper shadow root is missing')
    const ids = [...root.querySelectorAll('[id]')].map((element) => element.id).filter(Boolean)
    const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
    const controls = [...root.querySelectorAll('input, select, textarea')]
    const unnamedControls = controls
      .filter((control) => {
        if (
          control.type === 'hidden' ||
          control.hasAttribute('data-hidden') ||
          control.getAttribute('aria-hidden') === 'true' ||
          control.closest('[hidden], [aria-hidden="true"], [data-state="closed"]')
        ) {
          return false
        }
        const style = getComputedStyle(control)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          control.getClientRects().length > 0
        )
      })
      .filter((control) => {
        const labelledBy = control.getAttribute('aria-labelledby')
        const ariaLabel = control.getAttribute('aria-label')
        const labels =
          'labels' in control
            ? [...control.labels].map((label) => label.textContent?.trim()).filter(Boolean)
            : []
        return !ariaLabel && !labelledBy && labels.length === 0
      })
      .map((control) => ({
        element: `${control.tagName.toLowerCase()}#${control.id || '(no id)'}`,
        type: control.getAttribute('type'),
        placeholder: control.getAttribute('placeholder'),
        parentText: control.parentElement?.textContent?.trim().slice(0, 80) ?? '',
        html: control.outerHTML.slice(0, 300),
      }))
    return { duplicateIds, unnamedControls }
  })
}

function relativeLuminance(rgb) {
  const channels =
    rgb
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number) ?? []
  const linear = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1024, height: 900 },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  context.on('page', trackPage)
  context.on('weberror', (webError) => browserErrors.push(webError.error().message))
  await context.route('https://testingcf.jsdelivr.net/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        version: '0.5.0',
        notification: [],
        feedback: '',
      }),
    }),
  )
  await context.route('https://www.zhipin.com/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (
      route.request().isNavigationRequest() &&
      requestUrl.searchParams.has('boss-helper-fixture')
    ) {
      const lifecycleFixture = requestUrl.searchParams.get('boss-helper-fixture') === 'lifecycle'
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: fixtureHtml({
          contact: lifecycleFixture ? lifecycleSubmissionRequests > 0 : true,
        }),
      })
    }
    if (
      requestUrl.pathname.endsWith('/wapi/zpgeek/friend/add.json') &&
      route.request().frame().url().includes('boss-helper-fixture=lifecycle')
    ) {
      lifecycleSubmissionRequests += 1
      if (holdLifecycleSubmission) {
        await new Promise((resolve) => {
          releaseLifecycleSubmission = resolve
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ code: 0, message: 'success', zpData: {} }),
      })
    }
    return route.abort()
  })

  let [worker] = context.serviceWorkers()
  worker ??= await context.waitForEvent('serviceworker')
  trackWorker(worker)
  assert.match(worker.url(), /^chrome-extension:\/\/[^/]+\/background\.js$/)
  const extensionId = new URL(worker.url()).host

  await resetStorage(worker, { 'conf-model': [null] })
  const optionsPage = await context.newPage()
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`)
  await optionsPage.getByRole('main').waitFor()
  await optionsPage.getByText('首次使用三步', { exact: true }).waitFor()
  assert.equal(await optionsPage.locator('html').getAttribute('lang'), 'zh-CN')

  await optionsPage.getByRole('button', { name: '打开或切换到岗位页' }).click()
  await optionsPage.getByText(/已打开 BOSS 直聘岗位页|已切换到 BOSS 直聘页面/).waitFor()
  const openedBossPage = await waitForContextPage(context, (candidate) =>
    candidate.url().startsWith('https://www.zhipin.com/web/geek/job'),
  )
  await openedBossPage.close()

  const failedPage = await context.newPage()
  await failedPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=failure')
  const failedHost = await waitForBossUi(failedPage)
  await failedHost.getByText('配置加载失败，已阻止开始投递', { exact: true }).waitFor()
  const failedStart = failedHost.getByRole('button', { name: '开始', exact: true })
  assert.equal(await failedStart.isDisabled(), true)
  await failedStart.evaluate((button) => button.click())
  assert.equal(await failedPage.evaluate(() => window.__bossFixture.detailSelections), 0)
  await failedHost.getByRole('button', { name: '重新加载' }).waitFor()
  await failedPage.close()

  await resetStorage(
    worker,
    {},
    {
      'conf-model': [
        {
          key: 'legacy-model',
          name: '旧版模型',
          data: {
            base_url: 'https://example.com/v1',
            api_key: 'fixture-key',
            model: 'fixture-model',
          },
        },
      ],
    },
  )
  const migrationPage = await context.newPage()
  await migrationPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=migration')
  await waitForBossUi(migrationPage)
  const migratedModels = await waitForStorage(
    worker,
    'local',
    'conf-model',
    (value) => Array.isArray(value) && value[0]?.key === 'legacy-model',
  )
  assert.equal(migratedModels[0].name, '旧版模型')
  assert.equal(migratedModels[0].data.model, 'fixture-model')
  await migrationPage.close()

  const commonConfig = {
    configLevel: 'intermediate',
    autoApplyEnabled: { value: true },
    autoGreetingEnabled: { value: false },
    activityFilter: { value: false },
    friendStatus: { value: false },
    sameHrFilter: { value: false },
    notification: { value: false },
    aiReply: { enable: true },
    actionDelayMs: { value: 1 },
    delay: { deliveryStarts: 0, deliveryInterval: 0, deliveryPageNext: 0, messageSending: 0 },
  }
  await resetStorage(worker, {
    'conf-model': [],
    FormDataPrese: 'default',
    FormDataPreses: [
      { label: '默认配置', value: 'default' },
      { label: '工作配置 B', value: 'profile-b' },
    ],
    'web-geek-job-FormData': {
      ...commonConfig,
      deliveryLimit: { value: 3 },
    },
    'web-geek-job-FormData-profile-b': {
      ...commonConfig,
      deliveryLimit: { value: 9 },
    },
    'web-geek-job-Today': {
      date: localDateKey(),
      success: 4,
      total: 7,
      repeat: 1,
      activityFilter: 2,
      tasks: {},
    },
    'web-geek-job-Statistics': [],
  })

  const page = await context.newPage()
  await page.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=normal')
  const host = await waitForBossUi(page)
  const onboarding = host.getByRole('heading', { name: '首次安全使用清单', exact: true })
  await onboarding.waitFor()
  const onboardingText = await onboarding.locator('..').innerText()
  assert.match(onboardingText, /自己的 BOSS 账号/)
  assert.match(onboardingText, /筛选.*配置/)
  assert.match(onboardingText, /较小的每批数量/)
  await host.getByRole('button', { name: '我已了解', exact: true }).click()
  await onboarding.waitFor({ state: 'hidden' })
  await host.getByRole('button', { name: '使用指南', exact: true }).click()
  await onboarding.waitFor()
  assert.equal(await page.evaluate(() => window.__bossFixture.detailSelections), 0)
  await host.getByRole('button', { name: '我已了解', exact: true }).click()
  await onboarding.waitFor({ state: 'hidden' })
  await host.getByText('岗位总数：', { exact: true }).waitFor()
  assert.equal(
    await page.evaluate(() => document.querySelector('.page-job-wrapper').__vue__.jobList.length),
    1,
  )
  const detailsButton = host.locator('.card-details-toggle').first()
  await detailsButton.waitFor()
  assert.equal((await detailsButton.innerText()).trim(), '展开职位详情')
  const cardLayout = await host
    .locator('.job-card')
    .first()
    .evaluate((element) => {
      const card = getComputedStyle(element)
      const grid = getComputedStyle(element.parentElement)
      return {
        transform: card.transform,
        marginLeft: card.marginLeft,
        scrollbarGutter: grid.scrollbarGutter,
      }
    })
  assert.equal(cardLayout.transform, 'none')
  assert.equal(cardLayout.marginLeft, '0px')
  assert.match(cardLayout.scrollbarGutter, /stable/)
  assert.match(
    await host.getByText('岗位总数：', { exact: true }).locator('..').innerText(),
    /7\s*份/,
  )

  const initialChunks = requestedBossChunks()
  for (const feature of ['Config', 'AI', 'Logs', 'About']) {
    assert.ok(
      !initialChunks.some((name) => name.includes(`boss-${feature}-`)),
      `${feature} chunk loaded before its tab was opened`,
    )
  }

  const responsiveCases = [
    { width: 1024, label: '1024px' },
    { width: 800, label: '1024px at approximately 125% zoom' },
    { width: 512, label: '1024px at 200% zoom' },
    { width: 320, label: 'WCAG reflow width' },
    { width: 256, label: '1024px at 400% zoom' },
  ]
  for (const { width, label } of responsiveCases) {
    await assertNoPageOverflow(page, width, `Statistics tab at ${label}`)
  }
  await page.setViewportSize({ width: 1024, height: 900 })

  await host.getByRole('tab', { name: '配置', exact: true }).click()
  const deliveryLimit = host.getByRole('spinbutton', { name: '每批投递数量' })
  await deliveryLimit.waitFor()
  assert.ok(
    requestedBossChunks().some((name) => name.includes('boss-Config-')),
    'Config chunk was not loaded after opening the Config tab',
  )
  await assertNoPageOverflow(page, 512, 'Config tab at 200% zoom-equivalent width')
  await assertNoPageOverflow(page, 256, 'Config tab at 400% zoom-equivalent width')
  await page.setViewportSize({ width: 1024, height: 900 })
  assert.equal(await deliveryLimit.inputValue(), '3')
  const preset = host.getByRole('combobox', { name: /预设/ })
  await preset.click()
  await preset.press('ArrowDown')
  await page.getByRole('option', { name: '工作配置 B' }).click()
  const deliveryLimitHandle = await deliveryLimit.elementHandle()
  assert.ok(deliveryLimitHandle, 'Delivery limit input is missing')
  await page.waitForFunction((input) => input.value === '9', deliveryLimitHandle)
  assert.equal(await deliveryLimit.inputValue(), '9')
  await deliveryLimit.fill('10')
  await deliveryLimit.press('Tab')
  const saveConfiguration = host.getByRole('button', { name: '保存配置', exact: true })
  const saveConfigurationHandle = await saveConfiguration.elementHandle()
  assert.ok(saveConfigurationHandle, 'Save configuration button is missing')
  await page.waitForFunction((button) => !button.disabled, saveConfigurationHandle)
  await saveConfiguration.click()
  await host.getByText('当前配置已保存', { exact: true }).waitFor()
  const savedPresets = await extensionStorage(worker, 'local', 'get', [
    'web-geek-job-FormData',
    'web-geek-job-FormData-profile-b',
  ])
  assert.equal(savedPresets['web-geek-job-FormData'].deliveryLimit.value, 3)
  assert.equal(savedPresets['web-geek-job-FormData-profile-b'].deliveryLimit.value, 10)

  let controlAudit = await auditControls(page)
  assert.deepEqual(controlAudit.duplicateIds, [])
  assert.deepEqual(controlAudit.unnamedControls, [])

  await host.getByRole('checkbox', { name: '帮助' }).click()
  const helpTarget = host.locator('[data-help]:not([data-help="no-help"]):visible').first()
  await helpTarget.focus()
  assert.match(await helpTarget.getAttribute('aria-describedby'), /boss-helper-help-status/)
  const helpStatus = host.locator('#boss-helper-help-status')
  await helpStatus.waitFor()
  assert.match(await helpStatus.innerText(), /^帮助：/)
  await helpTarget.evaluate((element) =>
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })),
  )
  assert.equal(
    await host.locator('.overlay-box').evaluate((element) => getComputedStyle(element).display),
    'block',
  )
  await page.keyboard.press('Escape')
  assert.equal(
    await host.locator('.overlay-box').evaluate((element) => getComputedStyle(element).display),
    'none',
  )

  await host.getByRole('tab', { name: 'AI', exact: true }).click()
  assert.ok(
    requestedBossChunks().some((name) => name.includes('boss-AI-')),
    'AI chunk was not loaded after opening the AI tab',
  )
  const aiToggle = host
    .locator('button[aria-pressed]')
    .filter({ hasText: /已启用|已停用/ })
    .first()
  await aiToggle.waitFor()
  await assertNoPageOverflow(page, 512, 'AI tab at 200% zoom-equivalent width')
  await assertNoPageOverflow(page, 256, 'AI tab at 400% zoom-equivalent width')
  await page.setViewportSize({ width: 1024, height: 900 })
  const asyncHelpTarget = host.locator('[data-help^="先配置模型"]')
  await asyncHelpTarget.waitFor()
  const asyncHelpTargetHandle = await asyncHelpTarget.elementHandle()
  assert.ok(asyncHelpTargetHandle, 'AI help target is missing after the async tab loaded')
  await page.waitForFunction(
    (element) => element.getAttribute('aria-describedby')?.includes('boss-helper-help-status'),
    asyncHelpTargetHandle,
  )
  await asyncHelpTarget.focus()
  assert.equal(
    await asyncHelpTarget.evaluate((element) => element.getRootNode().activeElement === element),
    true,
    'Help target rendered by an async tab is not keyboard focusable',
  )
  assert.match(await aiToggle.innerText(), /已启用|已停用/)
  assert.match(await aiToggle.getAttribute('aria-pressed'), /^(true|false)$/)
  await host.locator('button[aria-label^="配置"]').first().waitFor()
  await host.getByRole('button', { name: '模型配置', exact: true }).click()
  await host.getByRole('dialog', { name: 'Ai模型配置' }).waitFor()
  await host.getByRole('button', { name: '新建', exact: true }).click()
  await host.getByRole('dialog', { name: '创建AI模型' }).waitFor()
  controlAudit = await auditControls(page)
  assert.deepEqual(controlAudit.duplicateIds, [])
  assert.deepEqual(controlAudit.unnamedControls, [])
  await host
    .getByRole('dialog', { name: '创建AI模型' })
    .getByRole('button', { name: '取消' })
    .click()
  await host
    .getByRole('dialog', { name: 'Ai模型配置' })
    .getByRole('button', { name: '完成' })
    .click()

  await host.getByRole('button', { name: '配置AI招呼语', exact: true }).click()
  const promptDialog = host.getByRole('dialog', { name: 'AI招呼语', exact: true })
  await promptDialog.waitFor()
  await promptDialog.locator('[aria-label="第 1 条提示词消息角色"]').waitFor()
  await promptDialog.getByRole('textbox', { name: '第 1 条提示词消息内容' }).waitFor()
  controlAudit = await auditControls(page)
  assert.deepEqual(controlAudit.duplicateIds, [])
  assert.deepEqual(controlAudit.unnamedControls, [])
  await promptDialog.getByRole('button', { name: '关闭', exact: true }).click()

  const jobTitle = host.locator('.card-title').first()
  await jobTitle.focus()
  await page.keyboard.press('Tab')
  assert.equal(
    await detailsButton.evaluate((button) => button.getRootNode().activeElement === button),
    true,
    'Job details button is missing from the keyboard Tab order',
  )
  await detailsButton.press('Enter')
  assert.equal(await detailsButton.getAttribute('aria-expanded'), 'true')
  assert.equal((await detailsButton.innerText()).trim(), '收起职位详情')
  await detailsButton.press('Space')
  assert.equal(await detailsButton.getAttribute('aria-expanded'), 'false')

  await host.getByRole('tab', { name: '统计', exact: true }).click()
  await host.getByRole('button', { name: '开始', exact: true }).click()
  const stopReason = host.locator('[data-testid="workflow-stop-reason"]')
  await stopReason.waitFor()
  assert.match(await stopReason.innerText(), /没有更多岗位/)
  const today = await waitForStorage(
    worker,
    'local',
    'web-geek-job-Today',
    (value) => value?.total === 8,
  )
  assert.equal(today.total, 8)
  assert.match(
    await host.getByText('岗位总数：', { exact: true }).locator('..').innerText(),
    /8\s*份/,
  )
  assert.equal(await page.evaluate(() => window.__bossFixture.detailSelections), 0)

  const statusColors = await host.locator('.card-status').evaluate((element) => {
    const style = getComputedStyle(element)
    return { foreground: style.color, background: style.backgroundColor }
  })
  assert.ok(
    contrastRatio(statusColors.foreground, statusColors.background) >= 4.5,
    `Job status contrast is below WCAG AA: ${JSON.stringify(statusColors)}`,
  )
  for (const [selector, label] of [
    ['.card-tag', 'job tag'],
    ['.card-salary', 'salary'],
    ['.author-row', 'author'],
  ]) {
    const foreground = await host
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).color)
    for (const background of ['rgb(242, 238, 238)', 'rgb(239, 240, 246)']) {
      assert.ok(
        contrastRatio(foreground, background) >= 4.5,
        `${label} contrast is below WCAG AA: ${foreground} on ${background}`,
      )
    }
  }

  await host.getByRole('button', { name: '对话', exact: true }).click()
  await page.evaluate(() => window.__bossFixture.dispatchConversation())
  const replyDraft = host.getByRole('textbox', { name: 'AI 回复草稿' })
  await replyDraft.waitFor()
  await replyDraft.fill('保留的测试草稿')
  await waitForStorage(
    worker,
    'session',
    'boss-helper-ai-reply-drafts',
    (value) => value?.['fixture-conversation']?.text === '保留的测试草稿',
  )
  await page.evaluate(() => window.__bossFixture.dispatchConversation('fixture-message-new'))
  const newMessageStatus = host.getByRole('status').filter({ hasText: '已有新消息' })
  await newMessageStatus.waitFor()
  assert.equal(await newMessageStatus.getAttribute('aria-live'), 'polite')
  await host.getByRole('button', { name: '重新生成草稿', exact: true }).click()
  await host.getByRole('alert').filter({ hasText: '生成失败' }).waitFor()

  const resourcesBefore = await page.evaluate(() => window.__bossFixture.resources())
  assert.equal(resourcesBefore.aiReplyListeners, 1)
  assert.equal(resourcesBefore.hookedDataKeys, 4)
  assert.equal(
    resourcesBefore.intervalDetails.some(({ timeout }) => timeout === 120 || timeout === 3000),
    false,
    `Non-streaming chat must not run indicator intervals: ${JSON.stringify(resourcesBefore.intervalDetails, null, 2)}`,
  )
  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(() => window.__bossFixture.navigate())
    try {
      await page.waitForFunction(
        (expectedIntervals) => {
          const resources = window.__bossFixture.resources()
          return (
            resources.hosts === 1 &&
            resources.aiReplyListeners === 1 &&
            resources.hookedDataKeys === 4 &&
            resources.intervals === expectedIntervals
          )
        },
        resourcesBefore.intervals,
        { timeout: 5_000 },
      )
    } catch (error) {
      const resources = await page.evaluate(() => window.__bossFixture.resources())
      throw new Error(
        `SPA remount did not settle: ${JSON.stringify({ resources, browserErrors })}`,
        {
          cause: error,
        },
      )
    }
  }
  const resourcesAfter = await page.evaluate(() => window.__bossFixture.resources())
  assert.equal(resourcesAfter.hosts, 1)
  assert.equal(resourcesAfter.aiReplyListeners, 1)
  assert.equal(
    resourcesAfter.intervals,
    resourcesBefore.intervals,
    `SPA remount leaked intervals: ${JSON.stringify(resourcesAfter.intervalDetails, null, 2)}`,
  )

  const remountedHost = await waitForBossUi(page)
  await page.evaluate(() => window.__bossFixture.replaceJobsAfterRemount())
  await remountedHost.getByRole('link', { name: '重挂后岗位 Fixture' }).waitFor()
  await remountedHost.getByRole('button', { name: '对话', exact: true }).click()
  await page.evaluate(() => window.__bossFixture.dispatchConversation())
  const restoredDraft = remountedHost.getByRole('textbox', { name: 'AI 回复草稿' })
  await restoredDraft.waitFor()
  assert.equal(await restoredDraft.inputValue(), '保留的测试草稿')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const transitionDuration = await remountedHost
    .locator('.job-card')
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  assert.match(transitionDuration, /^(0s|0\.00001s)(, (0s|0\.00001s))*$/)

  await page.close()

  const lifecycleStorage = (deliveryStarts) => ({
    'conf-model': [],
    'boss-helper-onboarding-complete': true,
    FormDataPrese: 'default',
    FormDataPreses: [{ label: '默认配置', value: 'default' }],
    'web-geek-job-FormData': {
      ...commonConfig,
      deliveryLimit: { value: 1 },
      delay: {
        deliveryStarts,
        deliveryInterval: 0,
        deliveryPageNext: 0,
        messageSending: 0,
      },
    },
    'web-geek-job-Today': {
      date: localDateKey(),
      success: 0,
      total: 0,
      repeat: 0,
      activityFilter: 0,
      tasks: {},
    },
    'web-geek-job-Statistics': [],
  })

  const assertLifecycleStatistics = async (label) => {
    const statistics = await waitForStorage(
      worker,
      'local',
      'web-geek-job-Today',
      (value) => value?.total === 1 && value?.success === 1,
      10_000,
    )
    assert.equal(statistics.total, 1, `${label} must count the job once`)
    assert.equal(statistics.success, 1, `${label} must count the submission once`)
  }

  lifecycleSubmissionRequests = 0
  await resetStorage(worker, lifecycleStorage(3))
  const throttledPage = await context.newPage()
  await throttledPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=lifecycle')
  const throttledHost = await waitForBossUi(throttledPage)
  await throttledHost.getByRole('link', { name: '前端工程师 Fixture' }).waitFor()
  await throttledHost.getByRole('button', { name: '开始', exact: true }).click()
  let runningCheckpoint
  try {
    runningCheckpoint = await waitForStorage(
      worker,
      'local',
      'boss-helper-workflow-run',
      (value) => value?.intent === 'running' && value?.ownerId,
    )
  } catch (error) {
    const [localStorage, hostText, resources] = await Promise.all([
      extensionStorage(worker, 'local', 'get', null),
      throttledHost.innerText(),
      throttledPage.evaluate(() => window.__bossFixture.resources()),
    ])
    throw new Error(
      `Lifecycle workflow did not start: ${JSON.stringify({ localStorage, hostText, resources, browserErrors })}`,
      { cause: error },
    )
  }
  const throttledSession = await context.newCDPSession(throttledPage)
  await throttledSession.send('Page.setWebLifecycleState', { state: 'frozen' })
  await extensionStorage(worker, 'local', 'set', {
    'boss-helper-workflow-run': {
      ...runningCheckpoint,
      heartbeatAt: Date.now() - 10 * 60 * 1000,
      progressAt: Date.now() - 10 * 60 * 1000,
    },
  })
  await optionsPage.bringToFront()
  await new Promise((resolve) => setTimeout(resolve, 250))
  await throttledSession.send('Page.setWebLifecycleState', { state: 'active' })
  await throttledPage.bringToFront()
  await waitForCondition(
    () => lifecycleSubmissionRequests === 1,
    'one submission after background-tab recovery',
    15_000,
  )
  const recoveredCheckpoint = await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.submittedJobKeys?.includes('boss::fixture-job'),
    10_000,
  )
  assert.equal(recoveredCheckpoint.batchSubmitted, 1)
  assert.equal(lifecycleSubmissionRequests, 1, 'background recovery must not duplicate submission')
  await assertLifecycleStatistics('background recovery')
  await throttledPage.close()

  lifecycleSubmissionRequests = 0
  await resetStorage(worker, lifecycleStorage(3))
  const bfcachePage = await context.newPage()
  await bfcachePage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=lifecycle')
  const bfcacheHost = await waitForBossUi(bfcachePage)
  await bfcacheHost.getByRole('link', { name: '前端工程师 Fixture' }).waitFor()
  await bfcacheHost.getByRole('button', { name: '开始', exact: true }).click()
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.intent === 'running' && value?.ownerId,
  )
  await bfcachePage.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  })
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) =>
      value?.intent === 'running' &&
      value?.ownerId === null &&
      value?.lastTransition === 'pagehide_bfcache',
  )
  await bfcachePage.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await waitForCondition(
    () => lifecycleSubmissionRequests === 1,
    'one submission after back-forward cache recovery',
    15_000,
  )
  const bfcacheCheckpoint = await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.submittedJobKeys?.includes('boss::fixture-job'),
    10_000,
  )
  assert.equal(bfcacheCheckpoint.batchSubmitted, 1)
  assert.equal(lifecycleSubmissionRequests, 1, 'BFCache recovery must not duplicate submission')
  await assertLifecycleStatistics('BFCache recovery')
  await bfcachePage.close()

  lifecycleSubmissionRequests = 0
  await resetStorage(worker, lifecycleStorage(3))
  const workerRestartPage = await context.newPage()
  await workerRestartPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=lifecycle')
  const workerRestartHost = await waitForBossUi(workerRestartPage)
  await workerRestartHost.getByRole('link', { name: '前端工程师 Fixture' }).waitFor()
  await workerRestartHost.getByRole('button', { name: '开始', exact: true }).click()
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.intent === 'running' && value?.ownerId,
  )
  await restartServiceWorker(context, workerRestartPage, worker.url(), () =>
    workerRestartPage.evaluate(() => window.dispatchEvent(new Event('focus'))),
  )
  const workerRestartCheckpoint = await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.submittedJobKeys?.includes('boss::fixture-job'),
    10_000,
  )
  assert.equal(workerRestartCheckpoint.batchSubmitted, 1)
  assert.equal(lifecycleSubmissionRequests, 1, 'worker restart must not duplicate submission')
  await assertLifecycleStatistics('worker restart')
  await workerRestartPage.close()

  lifecycleSubmissionRequests = 0
  await resetStorage(worker, lifecycleStorage(5))
  const pausedPage = await context.newPage()
  await pausedPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=lifecycle')
  let pausedHost = await waitForBossUi(pausedPage)
  await pausedHost.getByRole('link', { name: '前端工程师 Fixture' }).waitFor()
  await pausedHost.getByRole('button', { name: '开始', exact: true }).click()
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.intent === 'running',
  )
  await pausedHost.getByRole('button', { name: '暂停', exact: true }).click()
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) => value?.intent === 'paused' && value?.ownerId === null,
  )
  await pausedPage.reload()
  pausedHost = await waitForBossUi(pausedPage)
  const pausedReason = pausedHost.locator('[data-testid="workflow-stop-reason"]')
  await pausedReason.waitFor()
  assert.match(await pausedReason.innerText(), /已手动暂停/)
  await new Promise((resolve) => setTimeout(resolve, 5_500))
  assert.equal(lifecycleSubmissionRequests, 0, 'manual pause must never auto-resume after reload')
  await pausedPage.close()

  lifecycleSubmissionRequests = 0
  holdLifecycleSubmission = true
  await resetStorage(worker, lifecycleStorage(0))
  const restartPage = await context.newPage()
  await restartPage.goto('https://www.zhipin.com/web/geek/jobs?boss-helper-fixture=lifecycle')
  let restartHost = await waitForBossUi(restartPage)
  await restartHost.getByRole('link', { name: '前端工程师 Fixture' }).waitFor()
  await restartHost.getByRole('button', { name: '开始', exact: true }).click()
  await waitForCondition(
    () => lifecycleSubmissionRequests === 1,
    'the first in-flight lifecycle submission',
  )
  await waitForStorage(
    worker,
    'local',
    'boss-helper-workflow-run',
    (value) =>
      value?.submissionIntentJobKeys?.includes('boss::fixture-job') &&
      !value?.submittedJobKeys?.includes('boss::fixture-job'),
  )
  const reloaded = restartPage.waitForNavigation({ waitUntil: 'domcontentloaded' })
  await restartPage.evaluate(() => location.reload())
  await reloaded
  holdLifecycleSubmission = false
  releaseLifecycleSubmission?.()
  releaseLifecycleSubmission = undefined
  restartHost = await waitForBossUi(restartPage)
  try {
    await waitForStorage(
      worker,
      'local',
      'boss-helper-workflow-run',
      (value) => value?.submittedJobKeys?.includes('boss::fixture-job'),
      10_000,
    )
  } catch (error) {
    const [localStorage, fixture, recoveryText] = await Promise.all([
      extensionStorage(worker, 'local', 'get', null),
      restartPage.evaluate(() => ({
        contact: window.__bossFixture.job.contact,
        resources: window.__bossFixture.resources(),
      })),
      restartHost.locator('[data-testid="workflow-recovery-status"]').allInnerTexts(),
    ])
    throw new Error(
      `Lifecycle restart did not reconcile: ${JSON.stringify({ localStorage, fixture, recoveryText, lifecycleSubmissionRequests, browserErrors })}`,
      { cause: error },
    )
  }
  assert.equal(
    lifecycleSubmissionRequests,
    1,
    'lifecycle restart must reconcile in-flight work once',
  )
  await assertLifecycleStatistics('lifecycle restart')
  await restartHost.locator('[data-testid="workflow-stop-reason"]').waitFor()
  await restartPage.close()

  assert.equal(
    expectedFailureConsoleErrors.length,
    1,
    'The intentional initialization failure must emit exactly one diagnostic console error',
  )
  assert.deepEqual(browserErrors, [])
  console.log(
    `Chrome UI verification passed (extension ${extensionId}, ${responsiveCases.length} responsive/zoom-equivalent widths, 10 SPA remounts, background recovery, BFCache recovery, worker restart, lifecycle restart, manual pause, 0 browser errors)`,
  )
} finally {
  releaseLifecycleSubmission?.()
  await context?.close()
  await rm(profilePath, { recursive: true, force: true })
}
