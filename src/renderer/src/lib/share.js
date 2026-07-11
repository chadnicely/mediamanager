// Hosted sharing — uploads an image to Sniddy's share relay (Cloudflare Worker
// + R2) and returns a public viewer-page link that expires in 7 days.
export const HOSTED_WORKER = 'https://jotter-share.chad-nicely.workers.dev'

export async function hostedShareLink(imageUrl) {
  const blob = await (await fetch(imageUrl)).blob()
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result)
    fr.onerror = rej
    fr.readAsDataURL(blob)
  })
  const r = await fetch(`${HOSTED_WORKER}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl })
  })
  const out = await r.json()
  if (!out.ok) throw new Error(out.error || 'Upload failed')
  return out.url
}
