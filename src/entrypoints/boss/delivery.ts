import { TaskRegistry, taskResult } from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'

import type { BossHelperCtx } from './main'
import { requestDetail, sendPublishReq } from './requests'
import { BossZpJobItemData, BossZpDetailData } from './types'

export type BoosJobData = {
  jobitem: BossZpJobItemData
  detail: BossZpDetailData
}

const tasks = new TaskRegistry<BossHelperCtx, BoosJobData>()

function detailMatchesJob(detail: BossZpDetailData | undefined, job: BossZpJobItemData) {
  return (
    detail != null &&
    (detail.lid === job.lid ||
      detail.jobInfo?.encryptId === job.encryptJobId ||
      detail.securityId === job.securityId)
  )
}

async function waitForPageDetail(
  helper: BossHelperCtx,
  job: BossZpJobItemData,
  timeoutMs = 8000,
  signal?: AbortSignal,
): Promise<BossZpDetailData> {
  return new Promise<BossZpDetailData>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    let interval: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      if (timeout) clearTimeout(timeout)
      if (interval) clearInterval(interval)
      signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      cleanup()
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'))
    }

    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort, { once: true })

    timeout = setTimeout(() => {
      cleanup()
      reject(new Error('页面岗位详情获取超时'))
    }, timeoutMs)
    interval = setInterval(() => {
      if (detailMatchesJob(helper._jobDetail.value, job)) {
        cleanup()
        resolve(helper._jobDetail.value!)
      }
    }, 100)
  })
}

async function requestDetailFallback(
  job: BossZpJobItemData,
  signal?: AbortSignal,
): Promise<BossZpDetailData> {
  const lids = Array.from(new Set([job.lid, job.encryptJobId].filter(Boolean)))
  const errors: string[] = []

  for (const lid of lids) {
    try {
      const res = await requestDetail(
        {
          securityId: job.securityId,
          lid,
        },
        signal,
      )
      if (res.code === 0 && res.zpData) {
        return res.zpData
      }
      errors.push(`${lid}: ${res.message || `code=${res.code}`}`)
    } catch (error) {
      errors.push(`${lid}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(`接口岗位详情获取失败: ${errors.join('; ')}`)
}

export const bossWorkflow = defineTaskWorkflow<BossHelperCtx, BoosJobData>(
  defineTaskHandler(
    '已沟通',
    async () => {
      return async (taskContext, { jobData, rawData, state }) => {
        if (rawData.jobitem.contact) {
          if (taskContext.helper.workflow?.submissionPending(jobData.key)) {
            taskContext.ensureActive?.()
            const newlySubmitted = await taskContext.helper.workflow.confirmSubmission(jobData.key)
            state.deliverySubmitted = true
            state.deliveryNewlySubmitted = newlySubmitted
            state.deliveryRecovered = true
            logger.info('恢复时通过已沟通状态确认投递结果')
            return {
              status: 'success',
              msg: '投递状态已恢复',
            }
          }
          return taskResult.skip('已沟通')
        }
      }
    },
    {
      desc: '已沟通过滤',
    },
  ), // 已沟通过滤
  tasks.SameCompanyFilter(), // 相同公司过滤
  tasks.SameHrFilter(), // 相同hr过滤
  tasks.jobTitle(), // 岗位名筛选
  tasks.company(), // 公司名筛选
  tasks.salaryRange(), // 薪资筛选
  tasks.companySizeRange(), // 公司规模筛选
  tasks.goldHunterFilter(), // 猎头过滤
  defineTaskHandler(
    '岗位详情获取',
    () => async (ctx, job) => {
      ctx.helper._clickJobCardAction(job.rawData.jobitem)
      const detail = await waitForPageDetail(
        ctx.helper,
        job.rawData.jobitem,
        8000,
        ctx.signal,
      ).catch(async (pageError) => {
        if (ctx.signal?.aborted) throw pageError
        logger.warn('页面岗位详情获取失败，尝试接口获取', pageError)
        return requestDetailFallback(job.rawData.jobitem, ctx.signal)
      })

      job.rawData.detail = detail
      job.jobData = {
        ...job.jobData,
        activeTime: detail.brandComInfo.activeTime,
        activeTimeStr: detail.bossInfo.activeTimeDesc,
        jobDescription: detail.jobInfo.postDescription,
        city: detail.jobInfo.locationName,
        address: detail.jobInfo.address,
        addressCoords: [detail.jobInfo.longitude, detail.jobInfo.latitude],
        boss: {
          ...job.jobData.boss,
          isOnline: detail.bossInfo.bossOnline,
          isCertificated: detail.bossInfo.certificated,
          isFriend: detail.relationInfo.beFriend,
        },
        brand: {
          ...job.jobData.brand,
          labels: detail.brandComInfo.labels,
          introduce: detail.brandComInfo.introduce,
          stageName: detail.brandComInfo.stageName,
        },
      }
    },
    {
      state: 'request',
      stateMsg: '获取岗位详情',
    },
  ), // 获取岗位详情
  tasks.activityFilter({ deps: ['岗位详情获取'] }), // 活跃度过滤
  tasks.hrPosition({ deps: ['岗位详情获取'] }), // Hr职位筛选
  tasks.jobAddress({ deps: ['岗位详情获取'] }), // 工作地址筛选
  tasks.jobFriendStatus({ deps: ['岗位详情获取'] }), // 好友状态过滤
  tasks.jobContent({ deps: ['岗位详情获取'] }), // 工作内容筛选

  tasks.amap({ deps: ['岗位详情获取'] }), // 高德地图
  tasks.aiFiltering({ deps: ['岗位详情获取'] }), // AI过滤

  defineTaskHandler('岗位投递', (ctx) => async (taskContext, { jobData, rawData, state }) => {
    if (!ctx.helper.conf.formData.autoApplyEnabled.value) {
      return taskResult.skip('自动投递未启用')
    }

    taskContext.ensureActive?.()
    if (ctx.helper.workflow!.submissionConfirmed(jobData.key)) {
      state.deliverySubmitted = true
      state.deliveryNewlySubmitted ??= false
      return {
        status: 'success',
        msg: '投递状态已恢复',
      }
    }
    const submission = await ctx.helper.workflow!.beginSubmission(jobData.key)
    taskContext.ensureActive?.()
    if (
      submission.needsReconciliation &&
      (rawData.jobitem.contact || rawData.detail.relationInfo?.beFriend)
    ) {
      const newlySubmitted = await ctx.helper.workflow!.confirmSubmission(jobData.key)
      state.deliverySubmitted = true
      state.deliveryNewlySubmitted = newlySubmitted
      state.deliveryRecovered = true
      logger.info('恢复时确认岗位已经投递')
      return {
        status: 'success',
        msg: '投递状态已恢复',
      }
    }

    logger.info(submission.needsReconciliation ? '恢复未完成的投递请求' : '发送投递请求')
    await sendPublishReq(
      {
        securityId: rawData.jobitem.securityId,
        encryptJobId: rawData.jobitem.encryptJobId,
      },
      undefined,
      3,
      {},
      taskContext.signal,
    )
    taskContext.ensureActive?.()
    const newlySubmitted = await ctx.helper.workflow!.confirmSubmission(jobData.key)
    state.deliverySubmitted = true
    state.deliveryNewlySubmitted = newlySubmitted
    return {
      status: 'success',
      msg: '投递成功',
    }
  }), // 投递

  tasks.customGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // 自定义招呼语
  tasks.aiGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // AI招呼语
)
