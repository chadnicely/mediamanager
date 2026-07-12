// Client for the cloud media API (Cloudflare Pages Functions → R2 bucket).
// Same-origin on the hosted PWA: /api/media/*. An optional shared key (baked in
// at build via VITE_SNIDDY_MEDIA_KEY) is sent as a header, and as a query param
// for <img>/<video> URLs which can't set headers.

const KEY = import.meta.env.VITE_SNIDDY_MEDIA_KEY || ''

function headers(extra = {}) {
  return KEY ? { 'x-sniddy-key': KEY, ...extra } : extra
}
function keyQuery() {
  return KEY ? `&k=${encodeURIComponent(KEY)}` : ''
}

export const MEDIA_AREAS = ['images', 'videos', 'files', 'screenshots']

export async function listMedia(area, sub = '') {
  const r = await fetch(`/api/media/list?area=${area}&sub=${encodeURIComponent(sub)}`, {
    headers: headers()
  })
  if (!r.ok) throw new Error(`Couldn’t load ${area}.`)
  return r.json() // { folders:[{name,sub}], items:[{name,key,size,modified}] }
}

// Direct URL to stream/view an object (usable in <img>/<video> src).
export function fileUrl(key) {
  return `/api/media/file?key=${encodeURIComponent(key)}${keyQuery()}`
}

export async function uploadFile(area, sub, file, name) {
  const fname = (name || file.name || `upload-${Date.now()}`).replace(/[\\/]+/g, '-')
  const r = await fetch(
    `/api/media/upload?area=${area}&sub=${encodeURIComponent(sub)}&name=${encodeURIComponent(fname)}`,
    {
      method: 'POST',
      headers: headers({ 'content-type': file.type || 'application/octet-stream' }),
      body: file
    }
  )
  if (!r.ok) throw new Error('Upload failed.')
  return r.json()
}

export async function deleteItem(key) {
  const r = await fetch(`/api/media/delete?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: headers()
  })
  return r.ok
}
