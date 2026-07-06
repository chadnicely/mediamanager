// Jotter Capture — service worker.
// Handles three capture modes and hands the result to the Jotter desktop app
// via its loopback receiver (falling back to a normal download if Jotter isn't
// running, so a capture is never silently lost).

const JOTTER_URL = 'http://127.0.0.1:47600'
const SHARE_URL = 'https://jotter-share.chad-nicely.workers.dev'

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`
}

async function getGroup() {
  const { group } = await chrome.storage.local.get('group')
  return group || ''
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title,
      message
    })
  } catch {
    /* notifications are best-effort */
  }
}

// Shutter sound + white screen flash as capture confirmation. The sound plays
// in an offscreen extension page — pages the user hasn't clicked block audio
// (autoplay policy), but extension pages are exempt, so it always sounds.
async function playShutter() {
  try {
    const has = await chrome.offscreen.hasDocument?.()
    if (!has) {
      await chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: ['AUDIO_PLAYBACK'],
          justification: 'Play the camera shutter sound on capture'
        })
        .catch(() => {})
    }
    chrome.runtime.sendMessage({ type: 'play-shutter' }).catch(() => {})
  } catch {
    /* sound is best-effort */
  }
}

function confirmCapture(tab) {
  playShutter()
  if (!tab?.id) return
  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      func: () => {
        const flash = document.createElement('div')
        flash.style.cssText =
          'position:fixed;inset:0;z-index:2147483647;background:#fff;opacity:0.55;pointer-events:none;transition:opacity .4s ease'
        document.documentElement.appendChild(flash)
        requestAnimationFrame(() => {
          flash.style.opacity = '0'
          setTimeout(() => flash.remove(), 450)
        })
      }
    })
    .catch(() => {})
}

// A capture is NOT saved anywhere yet — play the shutter, then hand the image
// to the result card where the user decides: Save / Share / Save & Share /
// Edit / Delete. Captures too large for the in-page card are auto-saved so
// they can't be lost.
async function finishCapture(tab, dataUrl) {
  confirmCapture(tab)
  if (dataUrl.length > 12_000_000) {
    const r = await saveDirect(dataUrl)
    notify(
      r.ok ? 'Saved to Jotter' : 'Capture failed',
      r.ok ? 'Too large for the preview card — saved straight to Shots.' : r.error || ''
    )
    return { ok: r.ok, error: r.error }
  }
  showResultCard(tab, dataUrl, null)
  return { ok: true }
}

// Save a capture to Jotter without the card (download fallback if offline).
async function saveDirect(dataUrl) {
  try {
    const group = await getGroup()
    const r = await fetch(`${JOTTER_URL}/shots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, name: `Capture ${stamp()}`, group, stamp: stamp() })
    })
    const out = await r.json().catch(() => ({}))
    return { ok: r.ok && out.ok, error: out.error }
  } catch {
    try {
      await chrome.downloads.download({
        url: dataUrl,
        filename: `Jotter Shots/Capture ${stamp()}.png`
      })
      return { ok: true, fallback: true }
    } catch (e) {
      return { ok: false, error: e?.message || 'Save failed' }
    }
  }
}

// Inject the post-capture result card into the page (skipped for huge captures
// that would blow past the injection arg limit — they're already saved).
function showResultCard(tab, dataUrl, sub) {
  if (!tab?.id || dataUrl.length > 12_000_000) return
  chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: resultCard, args: [dataUrl, sub] })
    .catch(() => {})
}

async function activeTab() {
  // currentWindow is the window the popup belongs to — the page you're looking
  // at — which is more reliable than lastFocusedWindow.
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tab
}

// Chrome blocks extensions from capturing its own pages, the web store, etc.
function isRestricted(url) {
  return (
    !url ||
    /^(chrome|edge|brave|about|chrome-extension|devtools|view-source):/i.test(url) ||
    /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url)
  )
}

// --- Visible viewport -------------------------------------------------------
async function captureVisible(tab) {
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  return finishCapture(tab, dataUrl)
}

// --- Full page ---------------------------------------------------------------
// Primary: the debugger API grabs the ENTIRE page in one shot — no scrolling,
// works even when the page scrolls inside an inner container. Falls back to
// scroll-and-stitch if the debugger can't attach.
async function captureFullPage(tab) {
  // Where does this page actually scroll? Pages that scroll the document get
  // the one-shot debugger capture; pages that scroll an inner panel need the
  // scroll-and-stitch of THAT panel.
  let docScrolls = true
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const de = document.scrollingElement || document.documentElement
        return de.scrollHeight > de.clientHeight + 10
      }
    })
    docScrolls = !!result
  } catch {
    /* keep default */
  }
  if (docScrolls) {
    try {
      const dataUrl = await captureFullViaCDP(tab)
      return await finishCapture(tab, dataUrl)
    } catch {
      /* fall through to stitcher */
    }
  }
  return captureFullByScrolling(tab)
}

async function captureFullViaCDP(tab) {
  const target = { tabId: tab.id }
  await chrome.debugger.attach(target, '1.3')
  try {
    const lm = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics')
    const size = lm.cssContentSize || lm.contentSize
    const width = Math.min(Math.ceil(size.width), 8000)
    const height = Math.min(Math.ceil(size.height), 16000) // texture-size safety cap
    // Expand the (emulated) viewport to the whole document — required for the
    // full page to actually render; without it many pages return viewport only.
    await chrome.debugger.sendCommand(target, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    })
    await new Promise((r) => setTimeout(r, 150)) // brief settle for lazy content
    const shot = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    })
    await chrome.debugger
      .sendCommand(target, 'Emulation.clearDeviceMetricsOverride')
      .catch(() => {})
    return 'data:image/png;base64,' + shot.data
  } finally {
    chrome.debugger.detach(target).catch(() => {})
  }
}

// Fallback: scroll + stitch. Detects the REAL scroll container — the document
// or, on app-style pages, the largest scrollable inner panel — scrolls it in
// viewport steps, crops each grab to that panel, and stitches them together.
async function captureFullByScrolling(tab) {
  const [{ result: m }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const de = document.scrollingElement || document.documentElement
      let el = de
      let inner = false
      if (de.scrollHeight <= de.clientHeight + 10) {
        // Document doesn't scroll — find the biggest scrollable inner panel.
        let best = null
        let bestArea = 0
        for (const cand of document.querySelectorAll('*')) {
          if (cand.scrollHeight <= cand.clientHeight + 100) continue
          const cs = getComputedStyle(cand)
          if (!/(auto|scroll|overlay)/.test(cs.overflowY)) continue
          const area = cand.clientWidth * cand.clientHeight
          if (area > bestArea) {
            bestArea = area
            best = cand
          }
        }
        if (best) {
          el = best
          inner = true
        }
      }
      window.__jotterScroller = el
      const r = inner
        ? el.getBoundingClientRect()
        : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
      return {
        inner,
        fullH: el.scrollHeight,
        viewH: inner ? el.clientHeight : window.innerHeight,
        rx: Math.max(0, r.x),
        ry: Math.max(0, r.y),
        rw: inner ? el.clientWidth : window.innerWidth,
        dpr: window.devicePixelRatio || 1,
        start: el.scrollTop
      }
    }
  })
  if (!m) throw new Error('Could not measure the page')

  const dpr = m.dpr
  const W = Math.round(m.rw * dpr)
  const stepH = Math.round(m.viewH * dpr)
  const fullH = Math.min(m.fullH, 16000) // safety cap
  const canvas = new OffscreenCanvas(W, Math.round(fullH * dpr))
  const ctx = canvas.getContext('2d')

  const setScroll = (y) =>
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (sy) => {
        const el = window.__jotterScroller || document.scrollingElement
        el.scrollTop = sy
        if (el === document.scrollingElement || el === document.documentElement) {
          window.scrollTo({ top: sy, behavior: 'instant' })
        }
      },
      args: [y]
    })

  const steps = Math.ceil(fullH / m.viewH)
  let first = true
  for (let i = 0; i < steps; i++) {
    const y = Math.min(i * m.viewH, Math.max(0, fullH - m.viewH))
    await setScroll(y)
    // captureVisibleTab is hard rate-limited to ~2/s — 520ms is as fast as
    // Chrome allows between grabs.
    await new Promise((res) => setTimeout(res, first ? 200 : 520))
    first = false
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'jpeg',
      quality: 92 // much faster to encode than PNG; visually identical for screenshots
    })
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
    // Crop the scroll panel's region out of the visible grab, place at its offset.
    ctx.drawImage(
      bitmap,
      Math.round(m.rx * dpr),
      Math.round(m.ry * dpr),
      W,
      stepH,
      0,
      Math.round(y * dpr),
      W,
      stepH
    )
    bitmap.close()
  }

  await setScroll(m.start)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const outUrl = await blobToDataUrl(blob)
  return finishCapture(tab, outUrl)
}

// --- Region (Jing-style drag select) ----------------------------------------
async function armRegion(tab) {
  await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['region.css'] })
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['region.js'] })
}

async function cropRegion(tab, rect) {
  const dpr = rect.dpr || 1
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const w = Math.max(1, Math.round(rect.width * dpr))
  const h = Math.max(1, Math.round(rect.height * dpr))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, Math.round(rect.left * dpr), Math.round(rect.top * dpr), w, h, 0, 0, w, h)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const outUrl = await blobToDataUrl(blob)
  return finishCapture(tab, outUrl)
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}

// --- Post-capture result card (runs inside the page) -------------------------
// Self-contained: preview + Save / Share / Edit / Delete, plus a small
// annotator (pen, box, arrow, text) that saves the edited copy back to Jotter.
function resultCard(dataUrl, sub) {
  const old = document.getElementById('__jotter_result')
  if (old) old.remove()

  let current = dataUrl
  let currentSub = sub

  const host = document.createElement('div')
  host.id = '__jotter_result'
  host.style.cssText = 'position:fixed;bottom:22px;right:22px;z-index:2147483647'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `
  <style>
    .card{width:320px;background:#1f2430;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.5);
      overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#e8ecf1;animation:in .18s ease}
    @keyframes in{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
    .head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px}
    .head b{font-size:12.5px}
    .hbtns{display:flex;gap:2px;align-items:center}
    .ib{border:none;background:none;color:#9aa4b2;cursor:pointer;padding:5px;border-radius:6px;display:grid;place-items:center}
    .ib:hover{color:#fff;background:#2d3440}
    .ib.danger:hover{background:#e5484d;color:#fff}
    .ib svg{width:14px;height:14px}
    .x{border:none;background:none;color:#9aa4b2;font-size:16px;cursor:pointer;padding:2px 6px}
    .x:hover{color:#fff}
    .shot{display:block;width:100%;max-height:200px;object-fit:contain;background:#12151a;cursor:zoom-in}
    .row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px 12px}
    .b{border:none;border-radius:8px;padding:8px 4px;cursor:pointer;font-weight:600;font-size:12px;
      background:#2d3440;color:#e8ecf1;display:flex;flex-direction:column;align-items:center;gap:3px}
    .b:hover{background:#3a4250}
    .b.del:hover{background:#e5484d}
    .b svg{width:15px;height:15px}
    .toast{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);background:#fff;color:#12151a;
      font-weight:600;font-size:12px;padding:6px 12px;border-radius:999px;opacity:0;transition:.2s;pointer-events:none;white-space:nowrap}
    .toast.on{opacity:1}
    .ed{position:fixed;inset:0;background:rgba(10,12,16,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}
    .tools{display:flex;gap:6px;align-items:center;background:#1f2430;padding:8px 10px;border-radius:10px;flex-wrap:wrap;justify-content:center;max-width:92vw}
    .t{border:1px solid #3a4250;background:#2d3440;color:#e8ecf1;border-radius:7px;padding:6px 11px;cursor:pointer;font-size:12.5px;font-weight:600}
    .t.on{background:#2563eb;border-color:#2563eb}
    .sw{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
    .sw.on{border-color:#fff}
    canvas{max-width:92vw;max-height:72vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6);cursor:crosshair;background:#fff}
  </style>
  <div class="card">
    <div class="head"><b class="ttl">📸 Captured — not saved yet</b>
      <span class="hbtns">
        <button class="ib hdl" title="Download to your computer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <button class="ib hedit" title="Edit / annotate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
        </button>
        <button class="ib danger hdel" title="Discard this capture">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
        <button class="x" title="Close">✕</button>
      </span>
    </div>
    <img class="shot" title="Click to open full size">
    <div class="row">
      <button class="b save" title="Save into Jotter's Shots">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save
      </button>
      <button class="b share" title="Copy a share link (expires in 7 days)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share
      </button>
      <button class="b both" title="Save to Jotter and copy a share link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Save + Share
      </button>
    </div>
    <div class="toast"></div>
  </div>`

  const $ = (s) => root.querySelector(s)
  $('.shot').src = current

  const toastEl = $('.toast')
  let toastT
  function toast(msg) {
    toastEl.textContent = msg
    toastEl.classList.add('on')
    clearTimeout(toastT)
    toastT = setTimeout(() => toastEl.classList.remove('on'), 1800)
  }

  // Save into Jotter (replaces the previous save if re-saving after an edit).
  function saveShot(cb) {
    toast('Saving…')
    chrome.runtime.sendMessage(
      { type: 'save-shot', dataUrl: current, replaceSub: currentSub },
      (r) => {
        if (r && r.ok && r.fallback) {
          toast('Jotter offline — downloaded instead')
          $('.ttl').textContent = '📸 Captured — downloaded'
        } else if (r && r.ok) {
          currentSub = r.saved || currentSub
          toast('Saved to Jotter ✓')
          $('.ttl').textContent = '📸 Captured — saved to Jotter'
        } else {
          toast((r && r.error) || 'Save failed')
        }
        if (cb) cb(r && r.ok)
      }
    )
  }

  function shareShot() {
    toast('Creating link…')
    chrome.runtime.sendMessage({ type: 'share-dataurl', dataUrl: current }, (r) => {
      if (r && r.ok) {
        navigator.clipboard
          .writeText(r.url)
          .then(() => toast('Link copied — expires in 7 days'))
          .catch(() => toast(r.url))
      } else toast((r && r.error) || 'Share failed')
    })
  }

  $('.x').onclick = () => host.remove()
  $('.shot').onclick = () => window.open(current, '_blank')
  $('.hdl').onclick = () => {
    const a = document.createElement('a')
    a.href = current
    a.download = `jotter-capture-${Date.now()}.png`
    a.click()
    toast('Downloading…')
  }
  $('.save').onclick = () => saveShot()
  $('.share').onclick = () => shareShot()
  $('.both').onclick = () => saveShot((ok) => ok && shareShot())
  $('.hdel').onclick = () => {
    if (currentSub) {
      // Was saved this session — remove it from Jotter too.
      chrome.runtime.sendMessage({ type: 'delete-shot', sub: currentSub }, () => {})
    }
    toast('Discarded')
    setTimeout(() => host.remove(), 400)
  }

  // ---- Annotator ----
  $('.hedit').onclick = () => {
    const ed = document.createElement('div')
    ed.className = 'ed'
    ed.innerHTML = `
      <div class="tools">
        <button class="t tl on" data-tool="pen">✏️ Pen</button>
        <button class="t tl" data-tool="hl">🖍 Highlight</button>
        <button class="t tl" data-tool="box">▭ Box</button>
        <button class="t tl" data-tool="ell">◯ Circle</button>
        <button class="t tl" data-tool="arrow">↗ Arrow</button>
        <button class="t tl" data-tool="text">T Text</button>
        <button class="t tl" data-tool="num">① Steps</button>
        <button class="t tl" data-tool="blur">▩ Blur</button>
        <button class="t tl" data-tool="crop">✂ Crop</button>
        <button class="sw on" data-c="#e5484d" style="background:#e5484d"></button>
        <button class="sw" data-c="#ffe600" style="background:#ffe600"></button>
        <button class="sw" data-c="#f5a623" style="background:#f5a623"></button>
        <button class="sw" data-c="#2563eb" style="background:#2563eb"></button>
        <button class="sw" data-c="#16a34a" style="background:#16a34a"></button>
        <button class="sw" data-c="#111111" style="background:#111"></button>
        <button class="t undo">↶ Undo</button>
        <button class="t cancel">Cancel</button>
        <button class="t ok" style="background:#16a34a;border-color:#16a34a">✓ Apply</button>
      </div>
      <canvas></canvas>`
    root.appendChild(ed)
    const cv = ed.querySelector('canvas')
    const ctx = cv.getContext('2d')
    const img = new Image()
    let tool = 'pen'
    let color = '#e5484d'
    let drawing = false
    let sx = 0
    let sy = 0
    let snap = null
    let n = 1 // next step-badge number
    const undo = []

    img.onload = () => {
      cv.width = img.naturalWidth
      cv.height = img.naturalHeight
      ctx.drawImage(img, 0, 0)
    }
    img.src = current

    const pos = (e) => {
      const r = cv.getBoundingClientRect()
      return [((e.clientX - r.left) / r.width) * cv.width, ((e.clientY - r.top) / r.height) * cv.height]
    }
    const lw = () => Math.max(3, Math.round(cv.width / 300))

    ed.querySelectorAll('.tl').forEach((b) => {
      b.onclick = () => {
        ed.querySelectorAll('.tl').forEach((x) => x.classList.remove('on'))
        b.classList.add('on')
        tool = b.dataset.tool
      }
    })
    ed.querySelectorAll('.sw').forEach((b) => {
      b.onclick = () => {
        ed.querySelectorAll('.sw').forEach((x) => x.classList.remove('on'))
        b.classList.add('on')
        color = b.dataset.c
      }
    })
    ed.querySelector('.undo').onclick = () => {
      const prev = undo.pop()
      if (!prev) return
      const im = new Image()
      im.onload = () => {
        cv.width = im.width // also restores size (crop changes it)
        cv.height = im.height
        ctx.drawImage(im, 0, 0)
      }
      im.src = prev
    }
    ed.querySelector('.cancel').onclick = () => ed.remove()
    ed.querySelector('.ok').onclick = () => {
      current = cv.toDataURL('image/png')
      $('.shot').src = current
      toast(currentSub ? 'Edited — hit Save to update Jotter' : 'Edited — now Save or Share')
      ed.remove()
    }

    cv.addEventListener('mousedown', (e) => {
      const [x, y] = pos(e)
      if (undo.length > 19) undo.shift()
      undo.push(cv.toDataURL())
      if (tool === 'text') {
        const t = prompt('Text:')
        if (t) {
          ctx.fillStyle = color
          ctx.font = `bold ${Math.max(18, Math.round(cv.width / 40))}px system-ui,sans-serif`
          ctx.fillText(t, x, y)
        } else undo.pop()
        return
      }
      if (tool === 'num') {
        // Numbered step badge — auto-increments 1, 2, 3…
        const r = Math.max(15, Math.round(cv.width / 70))
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = Math.max(2, r / 8)
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = `bold ${Math.round(r * 1.15)}px system-ui,sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(n++), x, y)
        ctx.textAlign = 'start'
        ctx.textBaseline = 'alphabetic'
        return
      }
      drawing = true
      sx = x
      sy = y
      snap = ctx.getImageData(0, 0, cv.width, cv.height)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = lw()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (tool === 'pen') {
        ctx.beginPath()
        ctx.moveTo(x, y)
      }
    })
    cv.addEventListener('mousemove', (e) => {
      if (!drawing) return
      const [x, y] = pos(e)
      if (tool === 'pen') {
        ctx.lineTo(x, y)
        ctx.stroke()
      } else if (tool === 'hl') {
        // Translucent marker block — classic highlighter
        ctx.putImageData(snap, 0, 0)
        ctx.globalAlpha = 0.35
        ctx.fillRect(sx, sy, x - sx, y - sy)
        ctx.globalAlpha = 1
      } else if (tool === 'box') {
        ctx.putImageData(snap, 0, 0)
        ctx.strokeRect(sx, sy, x - sx, y - sy)
      } else if (tool === 'ell') {
        ctx.putImageData(snap, 0, 0)
        ctx.beginPath()
        ctx.ellipse((sx + x) / 2, (sy + y) / 2, Math.abs(x - sx) / 2, Math.abs(y - sy) / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else if (tool === 'arrow') {
        ctx.putImageData(snap, 0, 0)
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(x, y)
        ctx.stroke()
        const ang = Math.atan2(y - sy, x - sx)
        const h = lw() * 4
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - h * Math.cos(ang - 0.45), y - h * Math.sin(ang - 0.45))
        ctx.lineTo(x - h * Math.cos(ang + 0.45), y - h * Math.sin(ang + 0.45))
        ctx.closePath()
        ctx.fill()
      } else if (tool === 'blur' || tool === 'crop') {
        // Dashed marquee preview
        ctx.putImageData(snap, 0, 0)
        ctx.save()
        ctx.setLineDash([10, 7])
        ctx.strokeStyle = tool === 'crop' ? '#2563eb' : '#fff'
        ctx.lineWidth = Math.max(2, lw() / 2)
        ctx.strokeRect(sx, sy, x - sx, y - sy)
        ctx.restore()
      }
    })

    cv.addEventListener('mouseup', (e) => {
      if (!drawing) return
      drawing = false
      const [x, y] = pos(e)
      const rx = Math.round(Math.min(sx, x))
      const ry = Math.round(Math.min(sy, y))
      const rw = Math.round(Math.abs(x - sx))
      const rh = Math.round(Math.abs(y - sy))

      if (tool === 'blur') {
        ctx.putImageData(snap, 0, 0) // clear the marquee
        if (rw < 6 || rh < 6) return
        // Pixelate: shrink the region, blow it back up with smoothing off.
        const block = Math.max(8, Math.round(Math.max(rw, rh) / 14))
        const tmp = new OffscreenCanvas(Math.max(1, Math.ceil(rw / block)), Math.max(1, Math.ceil(rh / block)))
        const tctx = tmp.getContext('2d')
        tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, tmp.width, tmp.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, rx, ry, rw, rh)
        ctx.imageSmoothingEnabled = true
      } else if (tool === 'crop') {
        ctx.putImageData(snap, 0, 0)
        if (rw < 20 || rh < 20) return
        const tmp = new OffscreenCanvas(rw, rh)
        tmp.getContext('2d').drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh)
        cv.width = rw
        cv.height = rh
        ctx.drawImage(tmp, 0, 0)
      }
    })
    window.addEventListener('mouseup', () => (drawing = false))
  }

  document.documentElement.appendChild(host)
}

// --- Capture bar (runs inside the page) --------------------------------------
// A slim bar that slides down from the top of the page with the three capture
// modes. Opened with the keyboard shortcut; pressing it again toggles it away.
function captureBar() {
  const old = document.getElementById('__jotter_bar')
  if (old) {
    old.remove()
    return
  }
  const host = document.createElement('div')
  host.id = '__jotter_bar'
  host.style.cssText = 'position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483647'
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>
    .bar{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#1f2430;color:#e8ecf1;
      border-radius:0 0 14px 14px;box-shadow:0 10px 34px rgba(0,0,0,.45);font:13px system-ui,sans-serif;
      animation:drop .22s ease}
    @keyframes drop{from{transform:translateY(-110%)}to{transform:none}}
    .mark{width:26px;height:26px;border-radius:7px;background:linear-gradient(140deg,#8b5cf6,#6d28d9);
      display:grid;place-items:center;font-weight:800;color:#fff;font-size:14px;margin-right:2px}
    button{border:none;border-radius:8px;background:#2d3440;color:#e8ecf1;padding:8px 13px;cursor:pointer;
      font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px}
    button:hover{background:#3a4250}
    .x{background:none;padding:6px 8px;color:#9aa4b2}
    .x:hover{color:#fff;background:#2d3440}
  </style>
  <div class="bar">
    <span class="mark">J</span>
    <button class="v">🖥 Visible</button>
    <button class="f">📄 Full page</button>
    <button class="r">✂ Select area</button>
    <button class="x" title="Close (Esc)">✕</button>
  </div>`
  const close = () => {
    host.remove()
    document.removeEventListener('keydown', onKey, true)
  }
  const go = (type) => {
    close()
    // Give the bar a beat to disappear so it's never in the shot.
    setTimeout(() => chrome.runtime.sendMessage({ type }), 90)
  }
  root.querySelector('.v').onclick = () => go('capture-visible')
  root.querySelector('.f').onclick = () => go('capture-full')
  root.querySelector('.r').onclick = () => go('capture-region')
  root.querySelector('.x').onclick = close
  const onKey = (e) => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  document.documentElement.appendChild(host)
}

// --- Message routing --------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'play-shutter') return // handled by the offscreen page
  ;(async () => {
    try {
      if (msg.type === 'ping-jotter') {
        try {
          const r = await fetch(`${JOTTER_URL}/ping`)
          sendResponse({ ok: r.ok })
        } catch {
          sendResponse({ ok: false })
        }
        return
      }

      // Result-card actions (sent from the injected card in the page).
      if (msg.type === 'share-dataurl') {
        try {
          const r = await fetch(`${SHARE_URL}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl: msg.dataUrl })
          })
          const out = await r.json()
          sendResponse(out.ok ? { ok: true, url: out.url } : { ok: false, error: out.error })
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'Share failed' })
        }
        return
      }
      if (msg.type === 'delete-shot') {
        try {
          const r = await fetch(`${JOTTER_URL}/shots?sub=${encodeURIComponent(msg.sub)}`, {
            method: 'DELETE'
          })
          const out = await r.json().catch(() => ({}))
          sendResponse({ ok: r.ok && out.ok, error: out.error })
        } catch (e) {
          sendResponse({ ok: false, error: 'Jotter is not running' })
        }
        return
      }
      if (msg.type === 'save-shot') {
        try {
          const group = await getGroup()
          const r = await fetch(`${JOTTER_URL}/shots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dataUrl: msg.dataUrl,
              name: `Capture ${stamp()}`,
              group,
              stamp: stamp(),
              replaceSub: msg.replaceSub || undefined
            })
          })
          const out = await r.json().catch(() => ({}))
          sendResponse({ ok: r.ok && out.ok, saved: out.saved, error: out.error })
        } catch {
          // Jotter isn't running → download so the capture isn't lost.
          try {
            await chrome.downloads.download({
              url: msg.dataUrl,
              filename: `Jotter Shots/Capture ${stamp()}.png`
            })
            sendResponse({ ok: true, fallback: true })
          } catch (e) {
            sendResponse({ ok: false, error: e?.message || 'Save failed' })
          }
        }
        return
      }

      const tab = await activeTab()
      if (!tab) {
        sendResponse({ ok: false, error: 'No active tab' })
        return
      }
      if (
        ['capture-visible', 'capture-full', 'capture-region'].includes(msg.type) &&
        isRestricted(tab.url)
      ) {
        sendResponse({
          ok: false,
          error: 'Open a normal website to capture — Chrome blocks its own pages.'
        })
        return
      }

      if (msg.type === 'capture-visible') sendResponse(await captureVisible(tab))
      else if (msg.type === 'capture-full') sendResponse(await captureFullPage(tab))
      else if (msg.type === 'capture-region') {
        await armRegion(tab)
        sendResponse({ ok: true, armed: true })
      } else if (msg.type === 'region-selected') {
        // Comes from the content script; sender.tab is the page.
        sendResponse(await cropRegion(sender.tab, msg.rect))
      } else if (msg.type === 'region-cancelled') {
        sendResponse({ ok: true, cancelled: true })
      } else {
        sendResponse({ ok: false, error: 'Unknown command' })
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || 'Capture failed' })
    }
  })()
  return true // keep the message channel open for the async response
})

// Keyboard shortcuts (configure at chrome://extensions/shortcuts).
chrome.commands.onCommand.addListener(async (command) => {
  const tab = await activeTab()
  if (!tab || isRestricted(tab.url)) return
  try {
    if (command === 'capture-visible') await captureVisible(tab)
    else if (command === 'capture-full') await captureFullPage(tab)
    else if (command === 'capture-region') await armRegion(tab)
    else if (command === 'open-bar') {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureBar })
    }
  } catch {
    /* page may not allow injection */
  }
})
