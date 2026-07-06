import { useCallback, useEffect, useState } from 'react'
import Lightbox from './Lightbox.jsx'

function mediaUrl(p) {
  return `jotter-media://f/?p=${encodeURIComponent(p)}`
}
function thumbUrl(p, size) {
  return `jotter-media://f/?p=${encodeURIComponent(p)}&t=${size}`
}
function human(bytes) {
  if (!bytes) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

// Split a Windows/POSIX path into clickable breadcrumb segments.
function crumbs(dir) {
  const norm = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/')
  const out = []
  let acc = ''
  for (let i = 0; i < parts.length; i++) {
    acc = i === 0 ? parts[i] || '/' : `${acc}/${parts[i]}`
    out.push({ label: parts[i] || acc, path: acc })
  }
  return out
}

const LAST_KEY = 'jotter.imagesFolder'

// FastStone-style: point at a folder, instantly see thumbnails. No importing.
export default function FolderGallery() {
  const [dir, setDir] = useState(() => localStorage.getItem(LAST_KEY) || '')
  const [data, setData] = useState({ folders: [], items: [] })
  const [status, setStatus] = useState('idle') // idle | loading | ready
  const [quick, setQuick] = useState([])
  const [lb, setLb] = useState(-1)

  const open = useCallback((path) => {
    if (!path) return
    setStatus('loading')
    setLb(-1)
    window.api
      .listFolder(path)
      .then((res) => {
        console.log(`[FolderGallery] opened ${res.dir} → ${res.folders.length} folders, ${res.items.length} images`)
        setDir(res.dir)
        setData({ folders: res.folders, items: res.items })
        setStatus('ready')
        localStorage.setItem(LAST_KEY, res.dir)
      })
      .catch((e) => {
        console.log('[FolderGallery] listFolder failed:', e?.message)
        setStatus('ready')
      })
  }, [])

  // On mount: load quick folders, then open the last folder (or auto-open
  // Downloads/Pictures) so images show immediately — no empty screen.
  useEffect(() => {
    window.api.commonFolders?.().then((f) => {
      const list = f || []
      setQuick(list)
      const saved = localStorage.getItem(LAST_KEY)
      if (saved) open(saved)
      else {
        const start = list.find((q) => /download|picture/i.test(q.label)) || list[0]
        if (start) open(start.path)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function pick() {
    const picks = await window.api.pickFolders()
    if (picks?.[0]) open(picks[0])
  }

  const lbItems = data.items.map((it) => ({ name: it.name, url: mediaUrl(it.path) }))

  if (!dir) {
    return (
      <div className="fg-empty">
        <div className="fg-empty-icon">🖼</div>
        <h2>Browse a folder of images</h2>
        <p>Pick a folder and see every image inside — instantly, no importing.</p>
        <div className="fg-quick">
          {quick.map((q) => (
            <button key={q.path} className="fg-quick-btn" onClick={() => open(q.path)}>
              📁 {q.label}
            </button>
          ))}
          <button className="fg-quick-btn browse" onClick={pick}>
            Browse…
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="gallery">
      <div className="gallery-top fg-top">
        <div className="crumbs">
          {crumbs(dir).map((c, i, arr) => (
            <span key={c.path}>
              <button className="crumb" onClick={() => open(c.path)}>
                {c.label}
              </button>
              {i < arr.length - 1 && <span className="crumb-sep">›</span>}
            </span>
          ))}
        </div>
        <div className="fg-actions">
          {quick.map((q) => (
            <button key={q.path} className="btn-ghost fg-chip" onClick={() => open(q.path)}>
              {q.label}
            </button>
          ))}
          <button className="btn-ghost" onClick={pick}>
            📂 Open folder…
          </button>
        </div>
      </div>

      <div className="gallery-scroll">
        {status === 'loading' && <div className="area-note">Loading…</div>}

        {status === 'ready' && (
          <>
            {data.folders.length > 0 && (
              <div className="folder-row">
                {data.folders.map((f) => (
                  <button key={f.path} className="folder-tile" onClick={() => open(f.path)}>
                    <span className="folder-ico">📁</span>
                    <span className="folder-name">{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="img-grid">
              {data.items.map((it, i) => (
                <div key={it.path} className="img-tile" onClick={() => setLb(i)} title={`${it.name} · ${human(it.size)}`}>
                  <img src={thumbUrl(it.path, 320)} alt={it.name} loading="lazy" decoding="async" />
                </div>
              ))}
            </div>

            {data.folders.length === 0 && data.items.length === 0 && (
              <div className="area-note center">No images or subfolders in this folder.</div>
            )}
          </>
        )}
      </div>

      {lb >= 0 && lbItems[lb] && (
        <Lightbox items={lbItems} index={lb} onIndex={setLb} onClose={() => setLb(-1)} />
      )}
    </div>
  )
}
