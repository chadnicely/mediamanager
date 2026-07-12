// GET /api/media/file?key=images/foo.jpg  → streams the object bytes.
// Supports HTTP Range so videos can seek/stream on the phone.
import { AREAS } from './_middleware.js'

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key') || ''
  const area = key.split('/')[0]
  if (!AREAS.includes(area)) return new Response('bad key', { status: 400 })

  const rangeHeader = request.headers.get('range')
  let obj
  if (rangeHeader) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader)
    if (m) {
      const offset = Number(m[1])
      const length = m[2] ? Number(m[2]) - offset + 1 : undefined
      obj = await env.MEDIA.get(key, { range: length ? { offset, length } : { offset } })
    }
  }
  if (!obj) obj = await env.MEDIA.get(key)
  if (!obj) return new Response('not found', { status: 404 })

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, max-age=3600')

  if (obj.range && rangeHeader) {
    const start = obj.range.offset || 0
    const len = obj.range.length ?? obj.size - start
    headers.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`)
    headers.set('content-length', String(len))
    return new Response(obj.body, { status: 206, headers })
  }
  return new Response(obj.body, { headers })
}
