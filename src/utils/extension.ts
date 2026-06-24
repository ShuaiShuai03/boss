export const EXTENSION_CONTEXT_INVALIDATED_MESSAGE =
  '扩展上下文已失效，请刷新当前 BOSS 页面后再试'

export const EXTENSION_CONTENT_BRIDGE_UNAVAILABLE_MESSAGE =
  '扩展桥接未连接，请刷新当前 BOSS 页面后再试'

export function isExtensionContextInvalidated(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return (
    normalized.includes('extension context invalidated') ||
    normalized.includes('receiving end does not exist') ||
    normalized.includes('message port closed before a response was received')
  )
}

export function normalizeExtensionContextError(error: unknown) {
  if (!isExtensionContextInvalidated(error)) {
    return error
  }
  return new Error(EXTENSION_CONTEXT_INVALIDATED_MESSAGE, { cause: error })
}
