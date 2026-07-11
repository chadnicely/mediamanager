import { useCallback, useEffect, useState } from 'react'
import AreaLayout from '../components/AreaLayout.jsx'
import LibrarySetup from '../components/LibrarySetup.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { getGroups, addGroup, removeGroup, mergeGroups, safeName } from '../lib/groups.js'
import { getFavs, toggleFav } from '../lib/favorites.js'
import { getThumbSize, setThumbSize } from '../lib/thumbSize.js'
import { hostedShareLink } from '../lib/share.js'
import { TrashIcon, DownloadIcon, ShareIcon } from '../components/icons.jsx'

const AREA = 'screenshots'

function baseName(sub) {
  return (sub || '').split('/').filter(Boolean).pop() || sub
}

function thumbOf(url, size) {
  if (url && url.startsWith('jotter-media://')) {
    return url + (url.includes('?') ? '&' : '?') + `t=${size}`
  }
  return url
}

export default function ScreenshotsArea() {
  const [state, setState] = useState('checking') // checking | setup | ready
  const [groups, setGroups] = useState(() => getGroups(AREA))
  const [activeGroup, setActiveGroup] = useState(null)
  const [fav, setFav] = useState(false)
  const [shots, setShots] = useState([]) // { sub, name, url, modified }
  const [sel, setSel] = useState(null) // sub shown in the right detail drawer
  const [shareOpen, setShareOpen] = useState(false)
  const [lb, setLb] = useState(-1) // lightbox index (-1 = closed)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [favs, setFavs] = useState(() => getFavs(AREA))
  const [reload, setReload] = useState(0)
  const [renaming, setRenaming] = useState(null) // sub currently being renamed
  const [renameVal, setRenameVal] = useState('')
  const [size, setSize] = useState(() => getThumbSize(AREA, 130)) // small by default
  const [counts, setCounts] = useState(null)

  function changeSize(px) {
    setSize(px)
    setThumbSize(AREA, px)
  }

  useEffect(() => {
    if (state !== 'ready') return
    window.api.library.counts(AREA).then(setCounts).catch(() => {})
  }, [state, reload])

  useEffect(() => {
    window.api.library.ensure(AREA).then((c) => setState(c ? 'ready' : 'setup'))
  }, [])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  const sub = activeGroup ? `${activeGroup}/` : ''

  const load = useCallback(async () => {
    if (state !== 'ready') return
    try {
      let items
      if (fav) {
        items = getFavs(AREA).map((fs) => ({ sub: fs, name: baseName(fs) }))
      } else {
        const res = await window.api.library.list(AREA, sub)
        // keep sidebar groups in sync with real folders
        if (!activeGroup) setGroups(mergeGroups(AREA, res.folders.map((f) => f.name)))
        items = res.items
      }
      const withUrls = await Promise.all(
        items.map(async (it) => ({
          ...it,
          url: await window.api.library.url(AREA, it.sub)
        }))
      )
      // newest first — most useful for screenshots
      withUrls.sort((a, b) => (b.modified || 0) - (a.modified || 0))
      setShots(withUrls)
    } catch {
      setShots([])
    }
  }, [state, sub, fav, activeGroup])

  useEffect(() => {
    load()
  }, [load, reload])

  // Pick up captures pushed in by the Chrome extension (separate process) and
  // by other windows: refresh on focus and on a gentle interval.
  useEffect(() => {
    if (state !== 'ready') return
    const onFocus = () => setReload((r) => r + 1)
    window.addEventListener('focus', onFocus)
    const id = setInterval(() => setReload((r) => r + 1), 5000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
  }, [state])

  async function capture() {
    if (!window.api?.captureScreen) return flash('Capture only works in the desktop app.')
    setBusy(true)
    try {
      const results = await window.api.captureScreen()
      const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      for (let i = 0; i < results.length; i++) {
        const name = `${results[i].name} ${t}${results.length > 1 ? ` (${i + 1})` : ''}`
        await window.api.library.saveDataUrl(AREA, sub, name, results[i].dataUrl)
      }
      setReload((r) => r + 1)
      flash('Captured')
    } catch (e) {
      flash(e?.message || 'Capture failed.')
    } finally {
      setBusy(false)
    }
  }

  function createGroupNamed(name) {
    const n = safeName(name)
    if (!n) return
    window.api.library.createGroup(AREA, n)
    setGroups(addGroup(AREA, n))
    setActiveGroup(n)
  }
  async function deleteGroupNamed(name) {
    if (!window.confirm(`Delete group “${name}”? Screenshots inside it will be removed.`)) return
    await window.api.library.removeGroup(AREA, name)
    setGroups(removeGroup(AREA, name))
    if (activeGroup === name) setActiveGroup(null)
    setReload((r) => r + 1)
  }

  function favorite(s) {
    setFavs(toggleFav(AREA, s.sub))
    if (fav) setReload((r) => r + 1)
  }

  async function copyShot(s) {
    if (!s) return
    try {
      const blob = await (await fetch(s.url)).blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
      flash('Copied to clipboard')
    } catch {
      flash('Copy failed')
    }
  }

  // Share from the user's own R2 bucket — a signed link to their file.
  async function shareOwnR2(s) {
    if (!s) return
    setShareOpen(false)
    flash('Creating link…')
    try {
      const url = await window.api.library.shareLink(AREA, s.sub)
      await navigator.clipboard.writeText(url)
      flash('Share link copied (your R2)')
    } catch (e) {
      flash(e?.message || 'Couldn’t create a share link')
    }
  }

  function downloadShot(s) {
    if (!s) return
    const a = document.createElement('a')
    a.href = s.url
    a.download = s.name
    a.click()
  }

  // Share via Sniddy's hosted relay — works for everyone, link expires in 7 days.
  async function shareHostedShot(s) {
    if (!s) return
    flash('Creating link…')
    try {
      const url = await hostedShareLink(s.url)
      await navigator.clipboard.writeText(url)
      flash('Share link copied — expires in 7 days')
    } catch (e) {
      flash(e?.message || 'Couldn’t create a share link')
    }
  }

  // Quick delete (hover trash) — no confirm; goes to the Recycle Bin.
  async function removeQuick(s) {
    await window.api.library.remove(AREA, s.sub)
    setLb(-1)
    if (sel === s.sub) setSel(null)
    setReload((r) => r + 1)
  }

  // Close the drawer with Escape (when the lightbox isn't open).
  useEffect(() => {
    if (!sel) return
    const onKey = (e) => {
      if (e.key === 'Escape' && lb < 0) {
        setSel(null)
        setShareOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, lb])

  // Rename a capture (keeps its extension).
  async function renameShot(s, newName) {
    const name = String(newName || '').trim()
    setRenaming(null)
    if (!name || name === s.name) return
    try {
      await window.api.library.rename(AREA, s.sub, name)
      setReload((r) => r + 1)
    } catch (e) {
      flash(e?.message || 'Couldn’t rename')
    }
  }

  if (state !== 'ready') {
    return (
      <AreaLayout brand="📸" title="Screenshots">
        <div className="area-body">
          {state === 'setup' ? (
            <LibrarySetup area={AREA} label="Screenshots Location" onReady={() => setState('ready')} />
          ) : (
            <div className="area-note">Loading…</div>
          )}
        </div>
      </AreaLayout>
    )
  }

  return (
    <AreaLayout
      brand="📸"
      title="Screenshots"
      action={{ label: busy ? 'Capturing…' : '📸 Capture screen', onClick: capture }}
      nav={[
        {
          label: '📸 All Screenshots',
          count: counts ? counts.total : undefined,
          active: !fav && activeGroup === null,
          onClick: () => {
            setFav(false)
            setActiveGroup(null)
          }
        },
        { label: '⭐ Favorites', count: favs.length, active: fav, onClick: () => setFav(true) }
      ]}
      groups={{
        area: AREA,
        onCreate: createGroupNamed,
        onDelete: deleteGroupNamed,
        onBulkDone: () => {
          setGroups(getGroups(AREA))
          setReload((r) => r + 1)
        },
        items: groups.map((name) => ({
          name,
          count: counts ? counts.groups[name] || 0 : undefined,
          active: !fav && activeGroup === name,
          onClick: () => {
            setFav(false)
            setActiveGroup(name)
          }
        }))
      }}
    >
      <div className="gallery">
        <div className="gallery-top">
          <div className="crumbs">
            <span className="crumb-static">
              {fav ? '★ Favorites' : activeGroup || 'All Screenshots'} · {shots.length}
            </span>
          </div>
          <label className="thumb-slider" title="Thumbnail size">
            <span>🔍</span>
            <input
              type="range"
              min="90"
              max="320"
              step="10"
              value={size}
              onChange={(e) => changeSize(parseInt(e.target.value, 10))}
            />
          </label>
        </div>

        <div className="gallery-scroll">
          {shots.length === 0 ? (
            <div className="area-note center">
              No captures {activeGroup ? `in “${activeGroup}”` : 'yet'}. Hit “Capture screen”, or
              use the Sniddy browser extension.
            </div>
          ) : (
            <div
              className="shots-grid"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}
            >
              {shots.map((s) => (
                <div
                  key={s.sub}
                  className={`sgrid-tile ${sel === s.sub ? 'sel' : ''}`}
                  onClick={() => setSel(s.sub)}
                >
                  <div className="sgrid-thumb" style={{ height: Math.round(size * 0.68) }}>
                    <img src={thumbOf(s.url, 320)} alt={s.name} loading="lazy" decoding="async" />
                    <div className="shot-thumb-actions">
                      <button
                        title={favs.includes(s.sub) ? 'Unfavorite' : 'Favorite'}
                        onClick={(e) => {
                          e.stopPropagation()
                          favorite(s)
                        }}
                      >
                        {favs.includes(s.sub) ? '★' : '☆'}
                      </button>
                      <button
                        title="Download"
                        onClick={(e) => {
                          e.stopPropagation()
                          downloadShot(s)
                        }}
                      >
                        <DownloadIcon />
                      </button>
                      <button
                        title="Get a shareable link"
                        onClick={(e) => {
                          e.stopPropagation()
                          shareHostedShot(s)
                        }}
                      >
                        <ShareIcon />
                      </button>
                      <button
                        className="danger"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeQuick(s)
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  {renaming === s.sub ? (
                    <input
                      className="sgrid-rename"
                      autoFocus
                      value={renameVal}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onBlur={() => renameShot(s, renameVal)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameShot(s, renameVal)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <div
                      className="sgrid-name"
                      title="Click to rename"
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenaming(s.sub)
                        setRenameVal(s.name.replace(/\.[^.]+$/, ''))
                      }}
                    >
                      {favs.includes(s.sub) ? '★ ' : ''}
                      {s.name}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(() => {
        const cur = shots.find((s) => s.sub === sel)
        if (!cur) return null
        const idx = shots.indexOf(cur)
        return (
          <div className="shot-drawer">
            <div className="shot-drawer-head">
              {renaming === cur.sub ? (
                <input
                  className="shot-rename-input"
                  autoFocus
                  value={renameVal}
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={() => renameShot(cur, renameVal)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameShot(cur, renameVal)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span
                  className="shot-drawer-name"
                  title="Click to rename"
                  onClick={() => {
                    setRenaming(cur.sub)
                    setRenameVal(cur.name.replace(/\.[^.]+$/, ''))
                  }}
                >
                  {cur.name} ✏️
                </span>
              )}
              <button
                className="icon-btn"
                title="Close"
                onClick={() => {
                  setSel(null)
                  setShareOpen(false)
                }}
              >
                ×
              </button>
            </div>

            <div className="shot-drawer-media" title="Click to view full screen" onClick={() => setLb(idx)}>
              <img src={cur.url} alt={cur.name} />
            </div>
            {cur.modified ? (
              <div className="shot-drawer-meta">
                {new Date(cur.modified).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            ) : null}

            <div className="shot-drawer-actions">
              <button className="btn-ghost" onClick={() => favorite(cur)}>
                {favs.includes(cur.sub) ? '★ Favorited' : '☆ Favorite'}
              </button>
              <button className="btn-ghost" onClick={() => copyShot(cur)}>
                Copy
              </button>
              <button className="btn-ghost" onClick={() => downloadShot(cur)}>
                Download
              </button>
              <div className="share-wrap">
                <button className="btn-ghost" onClick={() => setShareOpen((o) => !o)}>
                  🔗 Share link ▾
                </button>
                {shareOpen && (
                  <div className="share-menu">
                    <button onClick={() => shareHostedShot(cur)}>
                      <b>Get a shareable link</b>
                      <small>Hosted by Sniddy · expires in 7 days</small>
                    </button>
                    <button onClick={() => shareOwnR2(cur)}>
                      <b>Use my own R2 bucket</b>
                      <small>Signed link from your storage</small>
                    </button>
                  </div>
                )}
              </div>
              <button className="danger-btn" onClick={() => removeQuick(cur)}>
                Delete
              </button>
            </div>
          </div>
        )
      })()}

      {lb >= 0 && shots[lb] && (
        <Lightbox
          items={shots.map((s) => ({ name: s.name, url: s.url }))}
          index={lb}
          onIndex={setLb}
          onClose={() => setLb(-1)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </AreaLayout>
  )
}
