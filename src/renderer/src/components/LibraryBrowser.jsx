import { useCallback, useEffect, useState } from 'react'
import { CATEGORIES, CATEGORY_META } from '../lib/fileTypes.js'
import { getFavs, toggleFav } from '../lib/favorites.js'
import { getThumbSize, setThumbSize } from '../lib/thumbSize.js'

function thumbOf(url, size) {
  if (url && url.startsWith('jotter-media://')) {
    return url + (url.includes('?') ? '&' : '?') + `t=${size}`
  }
  return url
}
function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase()
}
function isImage(name) {
  return CATEGORIES.Image.includes(extOf(name))
}
function isVideo(name) {
  return CATEGORIES.Video.includes(extOf(name))
}
function iconFor(name) {
  const e = extOf(name)
  const cat = Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(e))
  return CATEGORY_META[cat]?.icon || '📄'
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
function baseName(sub) {
  return sub.split('/').filter(Boolean).pop() || sub
}
function crumbs(sub) {
  const parts = sub.split('/').filter(Boolean)
  const out = [{ label: 'All', sub: '' }]
  let acc = ''
  for (const p of parts) {
    acc += p + '/'
    out.push({ label: p, sub: acc })
  }
  return out
}

// Shared middle-list + far-right-detail browser for a bucket/local library.
export default function LibraryBrowser({ area, label, addExts, sub, setSub, onScan, reloadToken, favMode }) {
  const [data, setData] = useState({ folders: [], items: [] })
  const [urls, setUrls] = useState({})
  const [sel, setSel] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [favs, setFavs] = useState(() => getFavs(area))
  const [size, setSize] = useState(() => getThumbSize(area, 40)) // small by default
  // 'media' = files only; 'folders' = folders + files (navigation view)
  const [mode, setMode] = useState(() => localStorage.getItem(`jotter-viewmode-${area}`) || 'folders')

  function changeSize(px) {
    setSize(px)
    setThumbSize(area, px)
  }

  function changeMode(m) {
    setMode(m)
    localStorage.setItem(`jotter-viewmode-${area}`, m)
  }

  const load = useCallback(
    async (s) => {
      setStatus('loading')
      setError('')
      try {
        let res
        if (favMode) {
          const favSubs = getFavs(area)
          res = { folders: [], items: favSubs.map((fs) => ({ name: baseName(fs), sub: fs, size: 0 })) }
        } else {
          res = await window.api.library.list(area, s)
        }
        setData(res)
        setSel(null)
        const entries = await Promise.all(
          res.items.map(async (it) => [it.sub, await window.api.library.url(area, it.sub)])
        )
        setUrls(Object.fromEntries(entries))
        setStatus('ready')
      } catch (e) {
        setError(e?.message || 'Could not load this library.')
        setStatus('error')
      }
    },
    [area, favMode]
  )

  useEffect(() => {
    load(sub)
  }, [sub, load, reloadToken])

  async function removeItem(it) {
    if (!window.confirm(`Remove “${it.name}” from your ${label.toLowerCase()} library?`)) return
    await window.api.library.remove(area, it.sub)
    load(sub)
  }

  function toggleFavorite(it) {
    setFavs(toggleFav(area, it.sub))
    if (favMode) load(sub) // dropped from the favorites view when un-favorited
  }

  const current = data.items.find((it) => it.sub === sel) || null

  return (
    <div className="lib">
      <div className="lib-top">
        {favMode ? (
          <div className="crumbs">
            <span className="crumb-static">★ Favorite {label}</span>
          </div>
        ) : (
          <div className="crumbs">
            {crumbs(sub).map((c, i, arr) => (
              <span key={c.sub}>
                <button className="crumb" onClick={() => setSub(c.sub)}>
                  {c.label === 'All' ? `All ${label}` : c.label}
                </button>
                {i < arr.length - 1 && <span className="crumb-sep">/</span>}
              </span>
            ))}
          </div>
        )}
        <div className="lib-top-actions">
          <div className="view-toggle">
            <button
              className={mode === 'media' ? 'on' : ''}
              title={`${label} only`}
              onClick={() => changeMode('media')}
            >
              {label}
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
              min="28"
              max="120"
              step="4"
              value={size}
              onChange={(e) => changeSize(parseInt(e.target.value, 10))}
            />
          </label>
          {!favMode && (
            <button className="btn-ghost scan-btn" onClick={onScan}>
              🔎 Scan Computer for {label}
            </button>
          )}
        </div>
      </div>

      <div className="lib-body">
        <div className="lib-list" style={{ '--libthumb': `${size}px` }}>
          {status === 'loading' && <div className="area-note">Loading…</div>}
          {status === 'error' && (
            <div className="area-note">
              {error} <button className="link-btn" onClick={() => load(sub)}>Retry</button>
            </div>
          )}
          {status === 'ready' && (
            <>
              {mode === 'folders' &&
                data.folders.map((f) => (
                <div key={f.sub} className="lib-row folder" onClick={() => setSub(f.sub)}>
                  <span className="lib-thumb">📁</span>
                  <span className="lib-row-name">{f.name}</span>
                </div>
              ))}
              {data.items.map((it) => (
                <div
                  key={it.sub}
                  className={`lib-row ${sel === it.sub ? 'sel' : ''}`}
                  onClick={() => setSel(it.sub)}
                >
                  <span className="lib-thumb">
                    {isImage(it.name) ? (
                      <img src={thumbOf(urls[it.sub], 96)} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="lib-ico">{iconFor(it.name)}</span>
                    )}
                  </span>
                  <span className="lib-row-name">{it.name}</span>
                  {favs.includes(it.sub) && <span className="lib-fav">★</span>}
                  {it.size ? <span className="lib-row-size">{human(it.size)}</span> : null}
                </div>
              ))}
              {(mode === 'media'
                ? !data.items.length
                : !data.folders.length && !data.items.length) && (
                <div className="area-note center">
                  {favMode
                    ? `No favorite ${label.toLowerCase()} yet — tap ☆ on an item.`
                    : `Nothing here yet — add ${label.toLowerCase()} or scan your computer.`}
                </div>
              )}
            </>
          )}
        </div>

        <div className="lib-detail">
          {current ? (
            <>
              <div className="lib-detail-media">
                {isImage(current.name) ? (
                  <img src={thumbOf(urls[current.sub], 1280)} alt={current.name} />
                ) : isVideo(current.name) ? (
                  <video src={urls[current.sub]} controls />
                ) : (
                  <div className="lib-detail-ico">{iconFor(current.name)}</div>
                )}
              </div>
              <div className="lib-detail-name">{current.name}</div>
              {current.size ? (
                <div className="lib-detail-meta">
                  {extOf(current.name).toUpperCase()} · {human(current.size)}
                </div>
              ) : null}
              <div className="lib-detail-actions">
                <button className="btn-ghost" onClick={() => toggleFavorite(current)}>
                  {favs.includes(current.sub) ? '★ Favorited' : '☆ Favorite'}
                </button>
                <a className="btn-ghost" href={urls[current.sub]} download={current.name}>
                  Download
                </a>
                <button className="danger-btn" onClick={() => removeItem(current)}>
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="lib-detail-empty">Select {label.toLowerCase()} to see details</div>
          )}
        </div>
      </div>
    </div>
  )
}
