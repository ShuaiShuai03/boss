import type { Ref } from 'vue'
import { ref, toValue } from 'vue'

const rootVue = ref()

export async function getRootVue(): Promise<any> {
  if (rootVue.value !== undefined) {
    return rootVue.value
  }

  const waitVueMount = async () => {
    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      const interval = setInterval(() => {
        const wrap = document.querySelector('#wrap')
        if (rootVue.value !== undefined) {
          clearInterval(interval)
          clearTimeout(timeout)
          return resolve(rootVue.value)
        }
        if (wrap && '__vue__' in wrap) {
          rootVue.value = wrap.__vue__
          resolve(rootVue.value)
          clearInterval(interval)
          clearTimeout(timeout)
        }
      }, 300)
      timeout = setTimeout(() => {
        reject(new Error('未找到vue根组件'))
        clearInterval(interval)
      }, 20000)
    })
  }

  await waitVueMount()
  return rootVue.value
}

export function useHookVueData<T = any>(
  selectors: string,
  key: string,
  data: Ref<T>,
  update?: (val: T) => void,
) {
  return async (signal?: AbortSignal) => {
    const jobVue = await new Promise<any>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      let interval: ReturnType<typeof setInterval>
      const cleanup = () => {
        clearInterval(interval)
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        const error = new Error('页面资源已释放')
        error.name = 'AbortError'
        reject(error)
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      interval = setInterval(() => {
        const jobVue = document.querySelector<any>(selectors)?.__vue__
        if (jobVue) {
          resolve(jobVue)
          cleanup()
        }
      }, 100)
      timeout = setTimeout(() => {
        reject(new Error('未找到对应元素'))
        cleanup()
      }, 20000)
    })

    data.value = jobVue[key]
    update?.(toValue(jobVue[key] as T))
    // eslint-disable-next-line no-restricted-properties
    const originalOwnDescriptor = Object.getOwnPropertyDescriptor(jobVue, key)
    let descriptor = originalOwnDescriptor
    let prototype = Object.getPrototypeOf(jobVue)
    while (!descriptor && prototype) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, key)
      prototype = Object.getPrototypeOf(prototype)
    }
    let currentValue = jobVue[key]
    let wasSet = false
    Object.defineProperty(jobVue, key, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        return descriptor?.get ? descriptor.get.call(this) : currentValue
      },
      set(val: T) {
        wasSet = true
        data.value = val
        update?.(val)
        if (descriptor?.set) {
          descriptor.set.call(this, val)
        } else {
          currentValue = val
        }
      },
    })

    return () => {
      if (originalOwnDescriptor) {
        Object.defineProperty(
          jobVue,
          key,
          'value' in originalOwnDescriptor
            ? { ...originalOwnDescriptor, value: currentValue }
            : originalOwnDescriptor,
        )
      } else if (wasSet && (!descriptor || 'value' in descriptor)) {
        Object.defineProperty(jobVue, key, {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          writable: descriptor && 'writable' in descriptor ? descriptor.writable : true,
          value: currentValue,
        })
      } else {
        delete jobVue[key]
      }
    }
  }
}

export function useHookVueFn(selectors: string, key: string | string[]) {
  return async (signal?: AbortSignal) => {
    const jobVue = await new Promise<any>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      let interval: ReturnType<typeof setInterval>
      const cleanup = () => {
        clearInterval(interval)
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        cleanup()
        const error = new Error('页面资源已释放')
        error.name = 'AbortError'
        reject(error)
      }
      if (signal?.aborted) return onAbort()
      signal?.addEventListener('abort', onAbort, { once: true })
      interval = setInterval(() => {
        const jobVue = document.querySelector<any>(selectors)?.__vue__
        if (jobVue) {
          resolve(jobVue)
          cleanup()
        }
      }, 100)
      timeout = setTimeout(() => {
        reject(new Error('未找到对应元素'))
        cleanup()
      }, 20000)
    })
    if (Array.isArray(key)) {
      for (const k of key) {
        if (jobVue[k]) {
          return jobVue[k]
        }
      }
    } else {
      return jobVue[key]
    }
  }
}
