// Jotter share relay (Cloudflare Worker).
// POST /upload  { dataUrl }         → stores in R2, returns a viewer-page link
// GET  /s/<id>.<ext>                → branded viewer PAGE (Jing-style header + image)
// GET  /i/<id>.<ext>                → the raw image bytes (used by the page + Download)
// Objects auto-expire via an R2 lifecycle rule (delete "shared/" after 7 days).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })

function page(origin, name) {
  const img = `${origin}/i/${name}`
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shared with Jotter</title>
<meta property="og:title" content="Shared with Jotter">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{--bg:#0b0d10;--panel:#14171c;--line:#232830;--text:#eef1f5;--dim:#98a3b0;--brand:#7c3aed;--brand2:#a78bfa}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    background:radial-gradient(1200px 600px at 50% -10%,#1a1230 0%,var(--bg) 55%);color:var(--text);
    min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
  header{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;
    padding:14px 24px;background:rgba(12,14,17,.7);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:12px}
  .mark{width:34px;height:34px;border-radius:9px;background:linear-gradient(140deg,#8b5cf6,#6d28d9);
    display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;box-shadow:0 4px 16px rgba(124,58,237,.45)}
  .name{font-size:17px;font-weight:750;letter-spacing:-.3px}
  .tag{color:var(--dim);font-size:12.5px;margin-top:1px}
  .actions{display:flex;gap:9px}
  .btn{display:inline-flex;align-items:center;gap:7px;text-decoration:none;cursor:pointer;font-weight:600;font-size:13.5px;
    padding:9px 15px;border-radius:9px;border:1px solid transparent;transition:.15s}
  .btn svg{width:15px;height:15px}
  .btn.primary{background:var(--brand);color:#fff}
  .btn.primary:hover{background:#8b5cf6}
  .btn.ghost{background:transparent;color:var(--text);border-color:var(--line)}
  .btn.ghost:hover{background:#1b2027;border-color:#33404d}
  main{flex:1;display:grid;place-items:center;padding:34px 24px}
  figure{max-width:min(1100px,100%);display:flex;flex-direction:column;gap:12px;align-items:center}
  .frame{padding:10px;border-radius:16px;background:linear-gradient(180deg,#191d24,#12151a);
    border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.55)}
  img{display:block;max-width:100%;max-height:74vh;border-radius:8px}
  footer{text-align:center;color:#6b7480;font-size:12.5px;padding:16px}
  footer a{color:var(--brand2);text-decoration:none}
  .toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);opacity:0;
    background:#fff;color:#12151a;font-weight:600;font-size:13px;padding:9px 16px;border-radius:999px;
    box-shadow:0 8px 30px rgba(0,0,0,.4);transition:.2s;pointer-events:none}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  @media(max-width:560px){.tag{display:none}.btn.ghost .lbl{display:none}}
</style></head><body>
<header>
  <div class="brand">
    <div class="mark">J</div>
    <div><div class="name">Jotter</div><div class="tag">Screenshots at the speed of conversation</div></div>
  </div>
  <div class="actions">
    <button class="btn ghost" onclick="copyLink()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      <span class="lbl">Copy link</span>
    </button>
    <a class="btn primary" href="${img}" download>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download
    </a>
  </div>
</header>
<main><figure><div class="frame"><img src="${img}" alt="Shared screenshot"></div></figure></main>
<footer>Captured with <strong style="color:var(--brand2)">Jotter</strong> &middot; link expires in 7 days</footer>
<div class="toast" id="toast">Link copied</div>
<script>
  function copyLink(){navigator.clipboard.writeText(location.href).then(()=>{var t=document.getElementById('toast');t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1600)})}
</script>
</body></html>`
}

function expiredPage() {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Link expired</title>
<body style="font-family:system-ui,sans-serif;background:#0f1216;color:#e8ecf1;height:100vh;margin:0;display:grid;place-items:center;text-align:center">
<div><div style="font-size:44px">🔗</div><h2 style="margin:10px 0 6px">This link has expired</h2>
<p style="color:#9aa4b2">Shared screenshots are kept for 7 days.</p></div></body>`
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    // ---- Upload ----
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const { dataUrl } = await request.json()
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '')
        if (!m) return json({ ok: false, error: 'Not a data URL' }, 400)
        const ct = m[1] || 'image/png'
        const bytes = m[2]
          ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
          : new TextEncoder().encode(decodeURIComponent(m[3]))
        if (bytes.length > 25 * 1024 * 1024) return json({ ok: false, error: 'Too large' }, 413)
        const ext = ct === 'image/jpeg' ? 'jpg' : ct === 'image/webp' ? 'webp' : 'png'
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        const name = `${id}.${ext}`
        await env.BUCKET.put(`shared/${name}`, bytes, { httpMetadata: { contentType: ct } })
        return json({ ok: true, url: `${url.origin}/s/${name}` })
      } catch (e) {
        return json({ ok: false, error: e.message || 'Upload failed' }, 500)
      }
    }

    // ---- Raw image bytes ----
    if (request.method === 'GET' && url.pathname.startsWith('/i/')) {
      const obj = await env.BUCKET.get(`shared/${url.pathname.slice(3)}`)
      if (!obj) return new Response('Expired', { status: 404 })
      const h = new Headers()
      obj.writeHttpMetadata(h)
      h.set('Cache-Control', 'public, max-age=86400')
      return new Response(obj.body, { headers: h })
    }

    // ---- Branded viewer page ----
    if (request.method === 'GET' && (url.pathname.startsWith('/s/') || url.pathname.startsWith('/v/'))) {
      const name = url.pathname.slice(3)
      const head = await env.BUCKET.head(`shared/${name}`)
      if (!head) return html(expiredPage(), 404)
      return html(page(url.origin, name))
    }

    return new Response('Jotter share relay', { status: 200, headers: CORS })
  }
}
