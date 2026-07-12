// POST /api/media/upload?area=images&sub=Trips/&name=photo.jpg
// Body is the raw file bytes. Used by the phone's camera / file picker.
import { AREAS, json } from './_middleware.js'

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url)
  const area = url.searchParams.get('area')
  const sub = url.searchParams.get('sub') || ''
  const name = (url.searchParams.get('name') || '').replace(/[\\/]+/g, '-').trim()
  if (!AREAS.includes(area) || !name) return json({ error: 'bad request' }, 400)

  const key = `${area}/${sub}${name}`
  await env.MEDIA.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get('content-type') || 'application/octet-stream'
    }
  })
  return json({ ok: true, key })
}
