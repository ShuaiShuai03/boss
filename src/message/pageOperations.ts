import { browser } from 'wxt/browser'

import { bossPageMessageTypes, parseBossPageSnapshot, type BossPageRequest } from './pageProtocol'

function collectBossSnapshotInMain() {
  const rootElement = document.querySelector('#wrap')
  const rootVue = rootElement && '__vue__' in rootElement ? rootElement.__vue__ : undefined
  const pageElement = document.querySelector(
    '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
  )
  const pageVue = pageElement && '__vue__' in pageElement ? pageElement.__vue__ : undefined
  const pageRecord = pageVue && typeof pageVue === 'object' ? pageVue : {}
  const rootRecord = rootVue && typeof rootVue === 'object' ? rootVue : {}
  const pageGlobal = window._PAGE && typeof window._PAGE === 'object' ? window._PAGE : {}
  const store =
    '$store' in rootRecord && rootRecord.$store && typeof rootRecord.$store === 'object'
      ? rootRecord.$store
      : {}
  const state =
    'state' in store && store.state && typeof store.state === 'object' ? store.state : {}
  const storeUser =
    'userInfo' in state && state.userInfo && typeof state.userInfo === 'object'
      ? state.userInfo
      : {}
  const route =
    '$route' in rootRecord && rootRecord.$route && typeof rootRecord.$route === 'object'
      ? rootRecord.$route
      : {}
  const user = {
    uid: 'uid' in pageGlobal ? pageGlobal.uid : 'uid' in storeUser ? storeUser.uid : undefined,
    userId:
      'userId' in pageGlobal
        ? pageGlobal.userId
        : 'userId' in storeUser
          ? storeUser.userId
          : undefined,
    encryptUserId:
      'encryptUserId' in pageGlobal
        ? pageGlobal.encryptUserId
        : 'encryptUserId' in storeUser
          ? storeUser.encryptUserId
          : undefined,
    name: 'name' in pageGlobal ? pageGlobal.name : 'name' in storeUser ? storeUser.name : undefined,
    showName:
      'showName' in pageGlobal
        ? pageGlobal.showName
        : 'showName' in storeUser
          ? storeUser.showName
          : undefined,
    tinyAvatar:
      'tinyAvatar' in pageGlobal
        ? pageGlobal.tinyAvatar
        : 'tinyAvatar' in storeUser
          ? storeUser.tinyAvatar
          : undefined,
    largeAvatar:
      'largeAvatar' in pageGlobal
        ? pageGlobal.largeAvatar
        : 'largeAvatar' in storeUser
          ? storeUser.largeAvatar
          : undefined,
  }
  const snapshot = {
    path: 'path' in route && typeof route.path === 'string' ? route.path : location.pathname,
    user,
    jobs:
      'jobList' in pageRecord && Array.isArray(pageRecord.jobList)
        ? pageRecord.jobList.slice(0, 100)
        : [],
    page:
      'pageVo' in pageRecord && pageRecord.pageVo && typeof pageRecord.pageVo === 'object'
        ? pageRecord.pageVo
        : { page: 1, pageSize: 15 },
    hasMore: !('hasMore' in pageRecord) || pageRecord.hasMore !== false,
    detail: 'jobDetail' in pageRecord ? pageRecord.jobDetail : undefined,
  }
  return JSON.parse(JSON.stringify(snapshot))
}

function changeBossPageInMain(page: number) {
  const element = document.querySelector(
    '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
  )
  const vue = element && '__vue__' in element ? element.__vue__ : undefined
  if (!vue || typeof vue !== 'object') throw new Error('BOSS 页面控制器不可用')
  const record = vue as Record<string, unknown>
  const candidates =
    location.pathname.includes('/web/geek/job-recommend') ||
    location.pathname.includes('/web/geek/jobs')
      ? ['searchJobAction', 'onSearch']
      : ['pageChangeAction']
  const handler = candidates.map((key) => record[key]).find((value) => typeof value === 'function')
  if (typeof handler !== 'function') throw new Error('BOSS 翻页操作不可用')
  Reflect.apply(handler, vue, [page])
  return true
}

function selectBossJobInMain(encryptJobId: string) {
  const element = document.querySelector(
    '#wrap .page-job-wrapper,.job-recommend-main,.page-jobs-main',
  )
  const vue = element && '__vue__' in element ? element.__vue__ : undefined
  if (!vue || typeof vue !== 'object') throw new Error('BOSS 页面控制器不可用')
  const record = vue as Record<string, unknown>
  const jobs = Array.isArray(record.jobList) ? record.jobList : []
  const job = jobs.find(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      'encryptJobId' in item &&
      item.encryptJobId === encryptJobId,
  )
  if (!job || typeof record.clickJobCardAction !== 'function') {
    throw new Error('目标岗位或岗位选择操作不可用')
  }
  Reflect.apply(record.clickJobCardAction, vue, [job])
  return true
}

function sendBossChatInMain(packet: number[], payload: number[]) {
  if (window.ChatWebsocket?.send) {
    const bytes = Uint8Array.from(payload)
    window.ChatWebsocket.send({
      toArrayBuffer: () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    })
    return { transport: 'ChatWebsocket' }
  }
  const candidates = [window.socket, window.top?.socket, window.parent?.socket]
  const socket = candidates.find(
    (candidate) => candidate?.readyState === WebSocket.OPEN && typeof candidate.send === 'function',
  )
  if (!socket) throw new Error('未找到可用聊天连接')
  const bytes = Uint8Array.from(packet)
  socket.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return { transport: 'socket' }
}

export async function executeBossPageOperation(request: BossPageRequest, tabId: number) {
  let results
  if (request.type === bossPageMessageTypes.snapshot) {
    results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: collectBossSnapshotInMain,
    })
  } else if (request.type === bossPageMessageTypes.changePage) {
    results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: changeBossPageInMain,
      args: [request.page],
    })
  } else if (request.type === bossPageMessageTypes.selectJob) {
    results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: selectBossJobInMain,
      args: [request.encryptJobId],
    })
  } else {
    results = await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      world: 'MAIN',
      func: sendBossChatInMain,
      args: [request.packet, request.payload],
    })
  }
  const result = results.find((entry) => entry.frameId === 0)
  if (!result) throw new Error('页面操作没有返回主框架结果')
  if (request.type === bossPageMessageTypes.snapshot) {
    const snapshot = parseBossPageSnapshot(result.result)
    if (!snapshot) throw new Error('BOSS 页面返回了无效快照')
    return snapshot
  }
  return result.result
}
