import assert from 'node:assert/strict'

import { readBoundedResponseText } from '../src/message/boundedResponse.ts'

function streamingResponse(chunks, headers = {}) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream, { headers })
}

// A normal, small response is read back in full.
{
  const res = streamingResponse(['hello ', 'world'])
  const text = await readBoundedResponseText(res, 1024)
  assert.equal(text, 'hello world')
}

// A response whose declared Content-Length already exceeds the cap is rejected before reading
// any body (BH-NET-01: never even start buffering an announced-oversize payload).
{
  const res = streamingResponse(['x'.repeat(2000)], { 'content-length': '2000' })
  await assert.rejects(readBoundedResponseText(res, 100), /响应体过大/)
}

// A response that lies about its size (no/short Content-Length) but streams more bytes than the
// cap must still be rejected once the running total crosses the limit, and the stream is
// cancelled rather than drained to completion.
{
  const res = streamingResponse(['a'.repeat(60), 'b'.repeat(60)])
  await assert.rejects(readBoundedResponseText(res, 100), /响应体过大/)
}

// Body exactly at the cap succeeds (boundary check is strictly-greater-than, not >=).
{
  const res = streamingResponse(['a'.repeat(100)])
  const text = await readBoundedResponseText(res, 100)
  assert.equal(text.length, 100)
}

console.log('bounded response verification passed')
