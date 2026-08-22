import { AlertProps } from '@nuxt/ui'
import { Toast } from '@nuxt/ui/runtime/composables/useToast.js'

import bundledNetConf from '../../../net-conf.json'
import { isNetConf } from './netConfValidation'
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


export async function initNetConf(): Promise<NetConf | undefined> {
  const data: unknown = bundledNetConf
  if (!isNetConf(data)) {
    logger.warn('内置网络配置格式不符合预期，已忽略')
    return undefined
  }
  const now = Date.now()
  for (const item of data.notification) {
    void netNotification(item, now).catch((error) => {
      logger.warn('网络通知已忽略', error)
    })
  }
  return data
}
