export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message))
    }, ms)

    Promise.resolve(promise).then(resolve, reject)
  }).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}
