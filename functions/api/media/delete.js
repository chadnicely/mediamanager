// POST /api/media/delete?key=images/foo.jpg  → removes one object.
import { AREAS, json } from './_middleware.js'

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key') || ''
  const area = key.split('/')[0]
  if (!AREAS.includes(area)) return json({ error: 'bad key' }, 400)
  await env.MEDIA.delete(key)
  return json({ ok: true })
}
