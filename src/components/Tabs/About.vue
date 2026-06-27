<script lang="ts" setup>
import shuaiRewardUrl from '@/assets/rewards/shuai-reward.jpg'

const authorRewardUrl = 'https://qiu-config.oss-cn-beijing.aliyuncs.com/reward.png'
</script>

<template>
  <div class="flex flex-col gap-4 xl:flex-row">
    <div class="flex-1">
      <Alert
        title="扩展完全免费且开源"
        description="要是付费购买请申请退款并举报, 谢谢~"
        color="primary"
      />
      <div class="flex items-center">
        <div class="hp-about" data-help="谢谢你的关心">
          <div data-help="愿为理想执着行，前路漫漫自铸金。">
            作者:&#12288;
            <ULink to="https://github.com/Ocyss" target="_blank"> Ocyss_04 </ULink>
          </div>
          <div data-help="感谢每一个人的付出">
            <div>
              鸣谢:&#12288;
              <ULink to="https://github.com/yangfeng20" target="_blank"> yangfeng20 </ULink>
            </div>
            <div>
              感谢贡献:&#12288;
              <ULink to="https://github.com/engvuchen" target="_blank"> engvuchen </ULink>
            </div>
          </div>
        </div>
      </div>
      <div data-help="记得来个Star或者好评吧" style="margin-top: 10px">
        该脚本分为浏览器扩展和油猴脚本，两版本皆已开源
        <br />
        Github地址:
        <ULink to="https://github.com/ocyss/boss-helper" target="_blank">
          https://github.com/ocyss/boss-helper
        </ULink>
        <br />
        greasyfork地址:
        <ULink to="https://greasyfork.org/zh-CN/scripts/491340" target="_blank">
          https://greasyfork.org/zh-CN/scripts/491340
        </ULink>
        <br />
        <br />
        <div class="flex flex-wrap gap-2">
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
        </div>
      </div>
      <div data-help=" " class="w-3/5 mt-2 select-text text-(--ui-bg)">
        除非不可抗因素，一般情况下不会停更，这个项目不止是帮助你们，也能帮到我
        <br />
      </div>
    </div>
    <div class="grid shrink-0 grid-cols-2 gap-3" data-help="感谢支持开源维护">
      <UPopover mode="hover" style="z-index: 10000" :content="{ side: 'left' }">
        <button
          type="button"
          class="flex flex-col items-center gap-2 rounded-md border border-default bg-default p-2 text-sm text-muted"
        >
          <img
            data-help="原作者 Ocyss_04 的赞赏码"
            class="size-42 bg-white object-contain"
            :src="authorRewardUrl"
            alt="Ocyss_04 的赞赏码"
          />
          <span>Ocyss_04</span>
        </button>
        <template #content>
          <img
            class="size-[50svh] bg-white object-contain"
            :src="authorRewardUrl"
            alt="Ocyss_04 的赞赏码"
          />
        </template>
      </UPopover>
      <UPopover mode="hover" style="z-index: 10000" :content="{ side: 'left' }">
        <button
          type="button"
          class="flex flex-col items-center gap-2 rounded-md border border-default bg-default p-2 text-sm text-muted"
        >
          <img
            data-help="SHUAI 的赞赏码"
            class="size-42 bg-white object-contain"
            :src="shuaiRewardUrl"
            alt="SHUAI 的赞赏码"
          />
          <span>SHUAI</span>
        </button>
        <template #content>
          <img
            class="size-[50svh] bg-white object-contain"
            :src="shuaiRewardUrl"
            alt="SHUAI 的赞赏码"
          />
        </template>
      </UPopover>
    </div>
  </div>
</template>
