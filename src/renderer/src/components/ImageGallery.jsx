import { useCallback, useEffect, useState } from 'react'
import Lightbox from './Lightbox.jsx'
import { getFavs, toggleFav } from '../lib/favorites.js'
import { getThumbSize, setThumbSize } from '../lib/thumbSize.js'
import { hostedShareLink } from '../lib/share.js'
import { TrashIcon, DownloadIcon, ShareIcon } from './icons.jsx'

function baseName(sub) {
  return sub.split('/').filter(Boolean).pop() || sub
}
function crumbs(sub) {
  const parts = sub.split('/').filter(Boolean)
  const out = [{ label: 'All Images', sub: '' }]
  let acc = ''
  for (const p of parts) {
    acc += p + '/'
    out.push({ label: p, sub: acc })
  }
  return out
}

// FastStone-style image gallery: thumbnail grid + full-screen viewer.
export default function ImageGallery({ sub, setSub, reloadToken, favMode, onScan }) {
  const area = 'images'
  const [data, setData] = useState({ folders: [], items: [] })
  const [urls, setUrls] = useState({})
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [lb, setLb] = useState(-1)
  const [favs, setFavs] = useState(() => getFavs(area))
  const [size, setSize] = useState(() => getThumbSize(area, 110)) // small by default
  const [toast, setToast] = useState('')
  // 'media' = images only; 'folders' = folder tiles + images (navigation view)
  const [mode, setMode] = useState(() => localStorage.getItem(`jotter-viewmode-${area}`) || 'media')

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

  // Quick delete — no confirm; local files go to the Recycle Bin.
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

  const items = data.items.map((it) => ({ key: it.sub, name: it.name, url: urls[it.sub] }))

  function favorite(it) {
    setFavs(toggleFav(area, it.key))
    if (favMode) load(sub)
  }
  const empty = !data.folders.length && !data.items.length

  return (
    <div className="gallery">
      <div className="gallery-top">
        {favMode ? (
          <div className="crumbs">
            <span className="crumb-static">★ Favorite Images</span>
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
              title="Images only"
              onClick={() => changeMode('media')}
            >
              🖼 Images
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
              🔎 Scan Computer for Images
            </button>
          )}
        </div>
      </div>

      <div className="gallery-scroll">
        {status === 'loading' && <div className="area-note">Loading…</div>}
        {status === 'error' && <div className="area-note">Couldn’t load images.</div>}

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
                <div key={it.key} className="img-tile" onClick={() => setLb(i)} title={it.name}>
                  {it.url ? (
                    <img src={it.url} alt={it.name} loading="lazy" />
                  ) : (
                    <div className="img-skel" />
                  )}
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
              ))}
            </div>

            {empty && (
              <div className="area-note center">
                {favMode ? 'No favorite images yet — tap ☆ on one.' : 'No images here yet — add some.'}
              </div>
            )}
          </>
        )}
      </div>

      {lb >= 0 && items[lb]?.url && (
        <Lightbox items={items} index={lb} onIndex={setLb} onClose={() => setLb(-1)} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
