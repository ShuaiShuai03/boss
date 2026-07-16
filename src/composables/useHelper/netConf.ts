import { AlertProps } from '@nuxt/ui'
import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

import { counter } from '@/message'

export interface NetConf {
  version: string
  version_description?: string
  notification: (NotificationAlert | NotificationNotification)[]
  store?: Record<string, [string, string, string]>
  price_info?: {
    signedKey: number
    account: number
    update_time: string
  }
  feedback: string
}

export interface NotificationAlert {
  key: string
  type: 'alert'
  data: AlertProps
}

export interface NotificationNotification {
  key: string
  type: 'notification'
  data: Partial<Toast> & {
    url?: string
    duration?: number
  }
}
const netNotificationMap = new Map<string, boolean>()

async function netNotification(
  item: NotificationAlert | NotificationNotification,
  now: number = 0,
) {
  if (now !== 0 && now < (await counter.storageGet(`local:netConf-${item.key}`, 0))) {
    return
  }
  const toast = useToast()
  if (netNotificationMap.has(item.key)) {
    return
  }
  netNotificationMap.set(item.key, true)
  if (item.type === 'notification') {
    void toast.add({
      ...item.data,
      duration: 0,
      'onUpdate:open': () => {
        void counter.storageSet(
          `local:netConf-${item.key}`,
          now + (item.data.duration ?? 86400) * 1000,
        )
      },
      onClick() {
        if (item.data.url) window.open(item.data.url)
      },
    })
  }
}

function isNetConf(value: unknown): value is NetConf {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as NetConf).version === 'string' &&
    Array.isArray((value as NetConf).notification)
  )
}

export async function initNetConf(): Promise<NetConf | undefined> {
  const response = await fetch('https://testingcf.jsdelivr.net/gh/Ocyss/boss-helper/net-conf.json')
  if (!response.ok) {
    logger.warn('远程配置获取失败', { status: response.status })
    return undefined
  }
  const data: unknown = await response.json()
  if (!isNetConf(data)) {
    logger.warn('远程配置格式不符合预期，已忽略')
    return undefined
  }
  const now = Date.now()
  for (const item of data.notification) {
    void netNotification(item, now)
  }
  return data
}
