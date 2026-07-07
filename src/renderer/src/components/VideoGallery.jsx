import { useCallback, useEffect, useState } from 'react'
import { getFavs, toggleFav } from '../lib/favorites.js'
import { getThumbSize, setThumbSize } from '../lib/thumbSize.js'
import { hostedShareLink } from '../lib/share.js'
import VideoThumb from './VideoThumb.jsx'
import { TrashIcon, DownloadIcon, ShareIcon } from './icons.jsx'

function baseName(sub) {
  return sub.split('/').filter(Boolean).pop() || sub
}
function fmtSize(bytes) {
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
function fmtDate(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDur(sec) {
  if (!sec || !isFinite(sec)) return ''
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
function crumbs(sub) {
  const parts = sub.split('/').filter(Boolean)
  const out = [{ label: 'All Videos', sub: '' }]
  let acc = ''
  for (const p of parts) {
    acc += p + '/'
    out.push({ label: p, sub: acc })
  }
  return out
}

// FastStone-style gallery for videos: thumbnail grid + click-to-play viewer.
// Mirrors ImageGallery's layout (same classes) so Videos matches Images.
export default function VideoGallery({ sub, setSub, reloadToken, favMode, onScan }) {
  const area = 'videos'
  const [data, setData] = useState({ folders: [], items: [] })
  const [urls, setUrls] = useState({})
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [player, setPlayer] = useState(-1)
  const [favs, setFavs] = useState(() => getFavs(area))
  const [size, setSize] = useState(() => getThumbSize(area, 160))
  const [durations, setDurations] = useState({}) // item key -> seconds (read from <video> metadata)
  const [toast, setToast] = useState('')
  const [mode, setMode] = useState(() => {
    // The old Videos browser persisted 'folders'; reset once so Videos opens in
    // the gallery by default, then respect whatever the user picks afterwards.
    if (!localStorage.getItem('jotter-videos-gallery-default')) {
      localStorage.setItem('jotter-videos-gallery-default', '1')
      localStorage.setItem(`jotter-viewmode-${area}`, 'media')
      return 'media'
    }
    return localStorage.getItem(`jotter-viewmode-${area}`) || 'media'
  })

  function changeMode(m) {
    setMode(m)
    localStorage.setItem(`jotter-viewmode-${area}`, m)
  }

  function changeSize(px) {
    setSize(px)
    setThumbSize(area, px)
  }

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  function download(it) {
    const a = document.createElement('a')
    a.href = it.url
    a.download = it.name
    a.click()
  }

  async function share(it) {
    flash('Creating link…')
    try {
      const url = await hostedShareLink(it.url)
      await navigator.clipboard.writeText(url)
      flash('Share link copied — expires in 7 days')
    } catch (e) {
      flash(e?.message || 'Couldn’t create a share link')
    }
  }

  async function removeQuick(it) {
    await window.api.library.remove(area, it.key)
    load(sub)
  }

  const load = useCallback(
    async (s) => {
      setStatus('loading')
      try {
        let res
        if (favMode) {
          const f = getFavs(area)
          res = { folders: [], items: f.map((fs) => ({ name: baseName(fs), sub: fs })) }
        } else {
          res = await window.api.library.list(area, s)
        }
        setData(res)
        const entries = await Promise.all(
          res.items.map(async (it) => [it.sub, await window.api.library.url(area, it.sub)])
        )
        setUrls(Object.fromEntries(entries))
        setStatus('ready')
      } catch {
        setStatus('error')
      }
    },
    [favMode]
  )

  useEffect(() => {
    load(sub)
  }, [sub, load, reloadToken])

  useEffect(() => {
    if (player < 0) return
    function onKey(e) {
      if (e.key === 'Escape') setPlayer(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player])

  const items = data.items.map((it) => ({
    key: it.sub,
    name: it.name,
    url: urls[it.sub],
    size: it.size,
    modified: it.modified
  }))

  function onMeta(key, dur) {
    setDurations((prev) => (prev[key] === dur ? prev : { ...prev, [key]: dur }))
  }

  function favorite(it) {
    setFavs(toggleFav(area, it.key))
    if (favMode) load(sub)
  }
  const empty = !data.folders.length && !data.items.length
  const current = player >= 0 ? items[player] : null

  return (
    <div className="gallery">
      <div className="gallery-top">
        {favMode ? (
          <div className="crumbs">
            <span className="crumb-static">★ Favorite Videos</span>
          </div>
        ) : (
          <div className="crumbs">
            {crumbs(sub).map((c, i, arr) => (
              <span key={c.sub}>
                <button className="crumb" onClick={() => setSub(c.sub)}>
                  {c.label}
                </button>
                {i < arr.length - 1 && <span className="crumb-sep">/</span>}
              </span>
            ))}
          </div>
        )}
        <div className="gallery-top-right">
          <div className="view-toggle">
            <button
              className={mode === 'media' ? 'on' : ''}
              title="Videos only"
              onClick={() => changeMode('media')}
            >
              🎬 Videos
            </button>
            <button
              className={mode === 'folders' ? 'on' : ''}
              title="Browse by folder"
              onClick={() => changeMode('folders')}
            >
              📁 Folders
            </button>
          </div>
          <label className="thumb-slider" title="Thumbnail size">
            <span>🔍</span>
            <input
              type="range"
              min="80"
              max="320"
              step="10"
              value={size}
              onChange={(e) => changeSize(parseInt(e.target.value, 10))}
            />
          </label>
          {!favMode && (
            <button className="btn-ghost scan-btn" onClick={onScan}>
              🔎 Scan Computer for Videos
            </button>
          )}
        </div>
      </div>

      <div className="gallery-scroll">
        {status === 'loading' && <div className="area-note">Loading…</div>}
        {status === 'error' && <div className="area-note">Couldn’t load videos.</div>}

        {status === 'ready' && (
          <>
            {mode === 'folders' && !favMode && data.folders.length > 0 && (
              <div className="folder-row">
                {data.folders.map((f) => (
                  <button key={f.sub} className="folder-tile" onClick={() => setSub(f.sub)}>
                    <span className="folder-ico">📁</span>
                    <span className="folder-name">{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div
              className="img-grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
            >
              {items.map((it, i) => (
                <div key={it.key} className="video-card">
                  <div className="img-tile video-tile" onClick={() => setPlayer(i)} title={it.name}>
                    {it.url ? (
                      <VideoThumb src={it.url} onDuration={(d) => onMeta(it.key, d)} />
                    ) : (
                      <div className="img-skel" />
                    )}
                    <span className="video-badge">▶</span>
                    {durations[it.key] ? (
                      <span className="video-duration">{fmtDur(durations[it.key])}</span>
                    ) : null}
                    <div className="shot-thumb-actions">
                      <button
                        title={favs.includes(it.key) ? 'Unfavorite' : 'Favorite'}
                        onClick={(e) => {
                          e.stopPropagation()
                          favorite(it)
                        }}
                      >
                        {favs.includes(it.key) ? '★' : '☆'}
                      </button>
                      <button
                        title="Download"
                        onClick={(e) => {
                          e.stopPropagation()
                          download(it)
                        }}
                      >
                        <DownloadIcon />
                      </button>
                      <button
                        title="Get a shareable link"
                        onClick={(e) => {
                          e.stopPropagation()
                          share(it)
                        }}
                      >
                        <ShareIcon />
                      </button>
                      <button
                        className="danger"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeQuick(it)
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  <div className="video-caption">
                    <div className="video-name" title={it.name}>{it.name}</div>
                    <div className="video-meta">
                      {[fmtSize(it.size), fmtDate(it.modified)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {empty && (
              <div className="area-note center">
                {favMode ? 'No favorite videos yet — tap ☆ on one.' : 'No videos here yet — add some.'}
              </div>
            )}
          </>
        )}
      </div>

      {current?.url && (
        <div className="lightbox" onClick={() => setPlayer(-1)}>
          <button className="lb-close" onClick={() => setPlayer(-1)} title="Close (Esc)">
            ×
          </button>
          <figure className="lb-figure" onClick={(e) => e.stopPropagation()}>
            <video src={current.url} controls autoPlay />
            <figcaption>{current.name}</figcaption>
          </figure>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
