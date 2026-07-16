// Reads a fetch Response body as text with a hard byte cap, instead of buffering an unbounded
// body in memory (BH-NET-01). Kept free of WXT/browser-extension imports so it can be unit tested
// directly with Node's built-in fetch types.

export async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`响应体过大 (${contentLength} 字节)，已超过上限 ${maxBytes} 字节`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    return response.text()
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`响应体过大，已超过上限 ${maxBytes} 字节`)
    }
    chunks.push(value)
  }

  const combined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}
