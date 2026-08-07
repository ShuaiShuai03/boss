<script lang="ts" setup>
import shuaiRewardUrl from '@/assets/rewards/shuai-reward.jpg'
import { VITE_VERSION } from '@/composables/useHelper'

const authorRewardUrl = 'https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png'

const rewards = [
  { name: 'Ocyss_04', role: '原作者', src: authorRewardUrl },
  { name: 'SHUAI', role: '扩展版维护', src: shuaiRewardUrl },
]
</script>

<template>
  <div class="about">
    <div class="about-main">
      <div class="about-callout is-ok">
        <p class="about-callout-title">扩展完全免费且开源</p>
        <p class="about-callout-desc">要是付费购买请申请退款并举报，谢谢~</p>
      </div>

      <div class="about-panel">
        <dl class="about-meta">
          <dt>版本</dt>
          <dd class="about-mono">v{{ VITE_VERSION }}</dd>

          <dt data-help="愿为理想执着行，前路漫漫自铸金。">原作者</dt>
          <dd><ULink to="https://github.com/Ocyss" target="_blank">Ocyss_04</ULink></dd>

          <dt data-help="感谢每一个人的付出">鸣谢</dt>
          <dd>
            <ULink to="https://github.com/yangfeng20" target="_blank">yangfeng20</ULink>
            ·
            <ULink to="https://github.com/engvuchen" target="_blank">engvuchen</ULink>
          </dd>

          <dt data-help="记得来个Star或者好评吧">开源地址</dt>
          <dd>
            <ULink to="https://github.com/ocyss/boss-helper" target="_blank">
              github.com/ocyss/boss-helper
            </ULink>
          </dd>

          <dt>脚本版</dt>
          <dd>
            <ULink to="https://greasyfork.org/zh-CN/scripts/491340" target="_blank">
              greasyfork.org / 491340
            </ULink>
          </dd>

          <dt>反馈</dt>
          <dd class="about-links">
            <ULink
              to="https://gai06vrtbc0.feishu.cn/share/base/form/shrcnmEq2fxH9hM44hqEnoeaj8g"
              target="_blank"
            >
              飞书反馈问卷(匿名)
            </ULink>
            <ULink
              to="https://gai06vrtbc0.feishu.cn/share/base/view/shrcnrg8D0cbLQc89d7Jj7AZgMc"
              target="_blank"
            >
              飞书问卷结果
            </ULink>
          </dd>
        </dl>
        <p class="about-note" data-help=" ">
          该脚本分为浏览器扩展和油猴脚本，两版本皆已开源。除非不可抗因素，一般情况下不会停更，这个项目不止是帮助你们，也能帮到我。
        </p>
      </div>

      <div class="about-callout is-err">
        <p class="about-callout-title is-err">风险提示</p>
        <p class="about-callout-desc">
          本项目仅供学习交流。自动化投递、自动化沟通和第三方模型调用都可能带来账号风控、信息误发或隐私泄露风险，使用前请充分理解配置含义。
        </p>
      </div>
    </div>

    <div class="about-support" data-help="感谢支持开源维护">
      <span class="cr-eyebrow">赞赏 · Support</span>
      <div class="about-rewards">
        <UPopover
          v-for="reward in rewards"
          :key="reward.name"
          mode="hover"
          style="z-index: 10000"
          :content="{ side: 'left' }"
        >
          <button type="button" class="about-reward">
            <img
              class="about-reward-img"
              :data-help="`${reward.name} 的赞赏码`"
              :src="reward.src"
              :alt="`${reward.name} 的赞赏码`"
            />
            <span class="about-reward-name">{{ reward.name }}</span>
            <span class="about-reward-role">{{ reward.role }}</span>
          </button>
          <template #content>
            <img
              class="size-[50svh] bg-white object-contain"
              :src="reward.src"
              :alt="`${reward.name} 的赞赏码`"
            />
          </template>
        </UPopover>
      </div>
    </div>
  </div>
</template>
