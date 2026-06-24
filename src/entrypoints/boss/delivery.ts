import { TaskRegistry, taskResult } from '@/composables/useApplying/handles'
import { defineTaskHandler, defineTaskWorkflow } from '@/composables/useApplying/type'

import { BossHelperCtx } from '.'
import { sendPublishReq } from './requests'
import { BossZpJobItemData, BossZpDetailData } from './types'

export type BoosJobData = {
  jobitem: BossZpJobItemData
  detail: BossZpDetailData
}

const tasks = new TaskRegistry<BossHelperCtx, BoosJobData>()

export const bossWorkflow = defineTaskWorkflow<BossHelperCtx, BoosJobData>(
  defineTaskHandler(
    '已沟通',
    async () => {
      return async (_, { rawData }) => {
        if (rawData.jobitem.contact) {
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
      // const detail = await requestDetail({
      //   securityId: job.rawData.jobitem.securityId,
      //   lid: job.rawData.jobitem.encryptJobId,
      // }).then((r) => r.zpData)

      ctx.helper._clickJobCardAction(job.rawData.jobitem)
      const detail = await new Promise<BossZpDetailData>((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout> | undefined
        let interval: ReturnType<typeof setInterval> | undefined
        const cleanup = () => {
          if (timeout) clearTimeout(timeout)
          if (interval) clearInterval(interval)
        }

        timeout = setTimeout(() => {
          cleanup()
          reject(new Error('bossZpDetailData获取超时'))
        }, 1000 * 60)
        interval = setInterval(() => {
          if (
            ctx.helper._jobDetail.value &&
            ctx.helper._jobDetail.value.lid === job.rawData.jobitem.lid
          ) {
            cleanup()
            resolve(ctx.helper._jobDetail.value)
          }
        }, 100)
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

  defineTaskHandler('岗位投递', (ctx) => async (_, { rawData }) => {
    if (!ctx.helper.conf.formData.autoApplyEnabled.value) {
      return taskResult.skip('自动投递未启用')
    }

    logger.info('发送投递请求', {
      securityId: rawData.jobitem.securityId,
      encryptJobId: rawData.jobitem.encryptJobId,
    })
    await sendPublishReq({
      securityId: rawData.jobitem.securityId,
      encryptJobId: rawData.jobitem.encryptJobId,
    })
    return {
      status: 'success',
      msg: '投递成功',
    }
  }), // 投递

  tasks.customGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // 自定义招呼语
  tasks.aiGreeting({ deps: ['岗位详情获取', '岗位投递'] }), // AI招呼语
)
