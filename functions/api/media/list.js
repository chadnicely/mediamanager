// GET /api/media/list?area=images&sub=Trips/  → folders + items at that level.
import { AREAS, json } from './_middleware.js'

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url)
  const area = url.searchParams.get('area')
  const sub = url.searchParams.get('sub') || ''
  if (!AREAS.includes(area)) return json({ error: 'bad area' }, 400)

  const prefix = `${area}/${sub}`
  const out = await env.MEDIA.list({ prefix, delimiter: '/' })

  const folders = (out.delimitedPrefixes || []).map((p) => ({
    name: p.slice(prefix.length).replace(/\/$/, ''),
    sub: p.slice(area.length + 1) // relative to the area root, keeps trailing /
  }))
  const items = (out.objects || [])
    .filter((o) => o.key !== prefix && !o.key.endsWith('/'))
    .map((o) => ({
      name: o.key.slice(prefix.length),
      key: o.key,
      size: o.size,
      modified: o.uploaded ? new Date(o.uploaded).getTime() : 0
    }))
  return json({ folders, items })
}
