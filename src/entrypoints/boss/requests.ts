// import axios from 'axios'

import {
  GreetError,
  BossHelperError,
  LimitError,
  PublishError,
  RateLimitError,
} from '@/composables/useApplying/deliverError'
import { logger } from '@/utils/logger'

import type { BossZpBossData, BossZpDetailData } from './types'

// const { userInfo } = useStore()
const toast = useToast()
export const sameCompanyKey = 'local:sameCompany'
export const sameHrKey = 'local:sameHr'
const BOSS_REQUEST_TIMEOUT_MS = 10000

export type PublishResponse = {
  code: number
  message: string
  zpData?: any
}

export type RequestBossDataOptions = {
  bossSrc?: number | string
  errorMsg?: string
  retries?: number
  retryDelayMs?: number
}

function normalizePublishResponse(res: any): PublishResponse {
  const data = res?.data ?? res ?? {}
  return {
    code: Number(data.code ?? -1),
    message: String(data.message ?? res?.message ?? ''),
    zpData: data.zpData,
  }
}

function normalizeRequestBossDataOptions(
  options: RequestBossDataOptions | string | undefined,
  retries: number,
): RequestBossDataOptions {
  if (typeof options === 'string') {
    return { errorMsg: options, retries }
  }
  return { retries, retryDelayMs: 2000, ...options }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export async function requestDetail(params: { securityId: string; lid: string }): Promise<{
  code: number
  message: string
  zpData: BossZpDetailData
}> {
  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new PublishError('没有获取到token')
  }
  const url = new URL('https://www.zhipin.com/wapi/zpgeek/job/detail.json')
  url.searchParams.set('securityId', params.securityId)
  url.searchParams.set('lid', params.lid)
  url.searchParams.set('_', String(Date.now()))

  return fetch(url.toString(), {
    headers: { Zp_token: token },
    signal: AbortSignal.timeout(BOSS_REQUEST_TIMEOUT_MS),
  }).then((r) => r.json())
}

export async function sendPublishReq(
  data: { securityId: string; encryptJobId: string },
  errorMsg?: string,
  retries = 3,
  _params = {},
): Promise<PublishResponse> {
  if (retries <= 0) {
    throw new PublishError(errorMsg ?? '重试多次失败')
  }
  const url = new URL('https://www.zhipin.com/wapi/zpgeek/friend/add.json')
  Object.entries({
    securityId: data.securityId,
    jobId: data.encryptJobId,
    ..._params,
  }).forEach(([key, value]) => url.searchParams.append(key, String(value)))

  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new PublishError('没有获取到token')
  }
  try {
    const rawRes = await fetch(url, {
      method: 'POST',
      headers: { Zp_token: token },
      signal: AbortSignal.timeout(BOSS_REQUEST_TIMEOUT_MS),
    }).then((r) => r.json())
    const res = normalizePublishResponse(rawRes)

    res.code !== 0 && logger.error(`投递失败`, rawRes)

    if (res.code === 1) {
      const content = String(
        res.zpData?.bizData?.chatRemindDialog?.content || res.message || '未知错误',
      )
      // 命中限额弹窗 → 立刻发送确认请求
      if (content.includes('您今天已与120位BOSS沟通')) {
        try {
          const url = new URL('https://www.zhipin.com/wapi/zpCommon/actionLog/geek/chatremind.json')
          url.searchParams.set('ba', res.zpData.bizData.chatRemindDialog.ba)
          url.searchParams.set('action', 'addf-limit-popup-c')
          await fetch(url, {
            method: 'POST',
            headers: { Zp_token: token },
            signal: AbortSignal.timeout(BOSS_REQUEST_TIMEOUT_MS),
          })

          const nextRetries = retries - 1
          if (nextRetries <= 0) {
            throw new PublishError(`投递限制确认后仍未成功: ${content}`)
          }
          return sendPublishReq(data, undefined, nextRetries, { cid: 1 })
        } catch (e) {
          if (e instanceof BossHelperError) {
            throw e
          }
          logger.error('尝试确认投递限制失败', e)
          throw new PublishError(`投递限制确认失败: ${content}`)
        }
      } else if (content.includes('您今天已与150位BOSS沟通')) {
        throw new LimitError(content)
      } else if (content.includes('操作过于频繁')) {
        throw new RateLimitError(content)
      }

      throw new PublishError(content)
    } else if (res.code !== 0) {
      throw new PublishError(`未知错误状态:${res.message}`)
    }
    return res
  } catch (e: any) {
    if (e instanceof BossHelperError) {
      throw e
    }
    return sendPublishReq(data, e?.message as string, retries - 1)
  }
}

export async function requestBossData(
  job: { encryptUserId: string; securityId: string },
  options?: RequestBossDataOptions | string,
  retries = 3,
): Promise<BossZpBossData> {
  const opt = normalizeRequestBossDataOptions(options, retries)
  const retryCount = opt.retries ?? 3
  if (retryCount <= 0) {
    throw new GreetError(opt.errorMsg ?? '重试多次失败')
  }
  const url = 'https://www.zhipin.com/wapi/zpchat/geek/getBossData'
  // userInfo.value?.token 不相等！
  const token = window?.Cookie.get('bst')
  if (!token) {
    toast.add({
      title: '没有获取到token,请刷新重试',
      color: 'error',
    })
    throw new GreetError('没有获取到token')
  }
  try {
    const body = new FormData()
    body.append('bossId', job.encryptUserId)
    body.append('securityId', job.securityId)
    body.append('bossSrc', String(opt.bossSrc ?? 0))

    const res: {
      code: number
      message: string
      zpData: BossZpBossData
    } = await fetch(url, {
      body: body,
      method: 'POST',
      headers: { Zp_token: token },
      signal: AbortSignal.timeout(BOSS_REQUEST_TIMEOUT_MS),
    }).then((r) => r.json())

    if (res.code !== 0) {
      if (res.message === '非好友关系') {
        const nextRetries = retryCount - 1
        if (nextRetries > 0) {
          await sleep(opt.retryDelayMs ?? 2000)
        }
        return await requestBossData(job, { ...opt, errorMsg: '非好友关系', retries: nextRetries })
      }
      throw new GreetError(`状态错误:${res.message}`)
    }
    return res.zpData
  } catch (e: any) {
    if (e instanceof GreetError) {
      throw e
    }
    return requestBossData(job, { ...opt, errorMsg: e?.message as string, retries: retryCount - 1 })
  }
}
