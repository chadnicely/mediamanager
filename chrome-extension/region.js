// Injected into the page for Jing-style region capture. Flow:
//   1) crosshair follows the cursor; drag to draw a selection (spotlight dims
//      everything outside it),
//   2) release → the box stays put with resize handles and a toolbar; drag the
//      box to move it, drag a handle to resize,
//   3) click Capture to grab exactly that region (Redo to redraw, ✕/Esc to quit).
;(() => {
  if (window.__jotterRegionActive) return
  window.__jotterRegionActive = true

  const NS = 'jotter-region'
  const make = (cls) => {
    const d = document.createElement('div')
    d.className = cls
    return d
  }

  const overlay = make(`${NS}-overlay`)
  const hLine = make(`${NS}-cross-h`)
  const vLine = make(`${NS}-cross-v`)
  const box = make(`${NS}-box`)
  const banner = make(`${NS}-banner`)
  banner.textContent = 'Click and drag to select an area · Esc to cancel'
  const bar = make(`${NS}-bar`)

  const HANDLE_POS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  for (const pos of HANDLE_POS) {
    const h = make(`${NS}-handle ${NS}-h-${pos}`)
    h.dataset.pos = pos
    box.appendChild(h)
  }

  // Toolbar
  const dims = make(`${NS}-dims`)
  const btnShot = make(`${NS}-btn ${NS}-btn-shot`)
  btnShot.title = 'Capture this area'
  btnShot.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
  const btnRedo = make(`${NS}-btn`)
  btnRedo.title = 'Redraw'
  btnRedo.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
  const btnCancel = make(`${NS}-btn`)
  btnCancel.title = 'Cancel (Esc)'
  btnCancel.innerHTML =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  bar.append(btnShot, dims, btnRedo, btnCancel)

  overlay.append(hLine, vLine, box, banner, bar)
  document.documentElement.appendChild(overlay)

  const VW = () => document.documentElement.clientWidth
  const VH = () => document.documentElement.clientHeight

  let phase = 'draw' // 'draw' | 'ready'
  let sel = null // { left, top, width, height }
  let action = null // 'draw' | 'move' | 'resize'
  let resizePos = null
  let anchor = null // fixed corner while drawing/resizing
  let moveOff = null // cursor offset within the box while moving

  function cleanup() {
    overlay.remove()
    window.__jotterRegionActive = false
    window.removeEventListener('mousemove', onMove, true)
    window.removeEventListener('mouseup', onUp, true)
    document.removeEventListener('keydown', onKey, true)
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cleanup()
      chrome.runtime.sendMessage({ type: 'region-cancelled' })
    } else if (e.key === 'Enter' && phase === 'ready') {
      e.preventDefault()
      capture()
    }
  }

  function moveCross(x, y) {
    hLine.style.top = y + 'px'
    vLine.style.left = x + 'px'
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

  function render() {
    if (!sel) return
    box.style.left = sel.left + 'px'
    box.style.top = sel.top + 'px'
    box.style.width = sel.width + 'px'
    box.style.height = sel.height + 'px'
    box.style.display = 'block'
    dims.textContent = `${Math.round(sel.width)} × ${Math.round(sel.height)}`
    // Toolbar below the box, or above if there's no room.
    const barTop = sel.top + sel.height + 10
    bar.style.left = clamp(sel.left, 6, VW() - 220) + 'px'
    bar.style.top = (barTop + 46 > VH() ? Math.max(6, sel.top - 46) : barTop) + 'px'
    bar.style.display = 'flex'
  }

  function beginReady() {
    phase = 'ready'
    banner.style.display = 'none'
    box.classList.add('ready')
    render()
  }

  function onMove(e) {
    const x = clamp(e.clientX, 0, VW())
    const y = clamp(e.clientY, 0, VH())
    if (phase === 'draw' && action !== 'draw') moveCross(x, y)

    if (action === 'draw') {
      sel = {
        left: Math.min(anchor.x, x),
        top: Math.min(anchor.y, y),
        width: Math.abs(x - anchor.x),
        height: Math.abs(y - anchor.y)
      }
      box.style.display = 'block'
      box.style.left = sel.left + 'px'
      box.style.top = sel.top + 'px'
      box.style.width = sel.width + 'px'
      box.style.height = sel.height + 'px'
      dims.textContent = `${Math.round(sel.width)} × ${Math.round(sel.height)}`
    } else if (action === 'move') {
      const nl = clamp(x - moveOff.x, 0, VW() - sel.width)
      const nt = clamp(y - moveOff.y, 0, VH() - sel.height)
      sel.left = nl
      sel.top = nt
      render()
    } else if (action === 'resize') {
      let { left, top, width, height } = sel
      let right = left + width
      let bottom = top + height
      if (resizePos.includes('w')) left = clamp(x, 0, right - 20)
      if (resizePos.includes('e')) right = clamp(x, left + 20, VW())
      if (resizePos.includes('n')) top = clamp(y, 0, bottom - 20)
      if (resizePos.includes('s')) bottom = clamp(y, top + 20, VH())
      sel = { left, top, width: right - left, height: bottom - top }
      render()
    }
  }

  function onUp() {
    if (action === 'draw') {
      action = null
      if (!sel || sel.width < 5 || sel.height < 5) {
        // treat as a mis-click — keep drawing
        sel = null
        box.style.display = 'none'
        return
      }
      beginReady()
      return
    }
    action = null
    resizePos = null
  }

  // Start drawing (only in draw phase, clicking empty overlay).
  overlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (phase === 'draw') {
      action = 'draw'
      anchor = { x: e.clientX, y: e.clientY }
      sel = { left: e.clientX, top: e.clientY, width: 0, height: 0 }
    }
  })

  // Move the box by dragging its interior (in ready phase).
  box.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || phase !== 'ready') return
    if (e.target.dataset.pos) {
      action = 'resize'
      resizePos = e.target.dataset.pos
    } else {
      action = 'move'
      moveOff = { x: e.clientX - sel.left, y: e.clientY - sel.top }
    }
    e.stopPropagation()
    e.preventDefault()
  })

  function capture() {
    if (!sel) return
    btnShot.classList.add('snap') // quick button feedback before we tear down
    const payload = { ...sel, dpr: window.devicePixelRatio || 1 }
    setTimeout(() => {
      cleanup()
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(() => chrome.runtime.sendMessage({ type: 'region-selected', rect: payload }), 30)
        )
      )
    }, 160)
  }

  btnShot.addEventListener('click', (e) => {
    e.stopPropagation()
    capture()
  })
  btnRedo.addEventListener('click', (e) => {
    e.stopPropagation()
    phase = 'draw'
    sel = null
    box.style.display = 'none'
    box.classList.remove('ready')
    bar.style.display = 'none'
    banner.style.display = ''
  })
  btnCancel.addEventListener('click', (e) => {
    e.stopPropagation()
    cleanup()
    chrome.runtime.sendMessage({ type: 'region-cancelled' })
  })

  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('mouseup', onUp, true)
  document.addEventListener('keydown', onKey, true)
  moveCross(VW() / 2, VH() / 2)
})()
