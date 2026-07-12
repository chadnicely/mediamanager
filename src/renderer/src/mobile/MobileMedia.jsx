// Cloud media gallery for one area (images / videos / files / screenshots).
// Reads from the R2-backed API, renders per type, and supports upload + delete.

import { useEffect, useRef, useState } from 'react'
import { listMedia, fileUrl, uploadFile, deleteItem } from '../lib/mediaApi.js'

const TITLES = {
  images: 'Images',
  videos: 'Videos',
  files: 'Files',
  screenshots: 'Screenshots'
}
const ACCEPT = {
  images: 'image/*',
  videos: 'video/*',
  files: '*/*',
  screenshots: 'image/*'
}

function fmtSize(n) {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function MobileMedia({ area, onBack }) {
  const isImage = area === 'images' || area === 'screenshots'
  const isVideo = area === 'videos'
  const [sub, setSub] = useState('')
  const [data, setData] = useState({ folders: [], items: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [viewer, setViewer] = useState(null) // key of image open in the lightbox
  const fileRef = useRef(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await listMedia(area, sub))
    } catch (e) {
      setError(e.message || 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, sub])

  async function onPick(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setBusy(`Uploading ${files.length}…`)
    try {
      for (const f of files) await uploadFile(area, sub, f)
      await load()
    } catch (err) {
      setError(err.message || 'Upload failed.')
    } finally {
      setBusy('')
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete “${item.name}”?`)) return
    setBusy('Deleting…')
    try {
      await deleteItem(item.key)
      await load()
    } finally {
      setBusy('')
    }
  }

  const goUp = sub ? () => setSub(sub.replace(/[^/]+\/$/, '')) : onBack

  return (
    <div className="m-screen m-media">
      <header className="m-topbar">
        <button className="m-icon-btn" onClick={goUp} aria-label="Back">
          <BackIcon />
        </button>
        <div className="m-topbar-title">{sub ? decodeURIComponent(sub.replace(/\/$/, '').split('/').pop()) : TITLES[area]}</div>
        <button className="m-icon-btn" onClick={() => fileRef.current?.click()} aria-label="Upload">
          <UploadIcon />
        </button>
      </header>

      {busy && <div className="m-media-busy">{busy}</div>}
      {error && <div className="m-media-error">{error}</div>}

      {loading ? (
        <div className="m-empty"><p>Loading…</p></div>
      ) : (
        <div className="m-list">
          {data.folders.map((f) => (
            <button key={f.sub} className="m-nb-row" onClick={() => setSub(f.sub)}>
              <FolderIcon />
              <span className="m-nb-name">{f.name}</span>
              <span className="m-nb-count">›</span>
            </button>
          ))}

          {!data.folders.length && !data.items.length && (
            <div className="m-empty">
              <p>Nothing here yet.</p>
              <button className="m-link" onClick={() => fileRef.current?.click()}>
                Upload {isImage ? 'a photo' : isVideo ? 'a video' : 'a file'}
              </button>
            </div>
          )}

          {isImage && (
            <div className="m-media-grid">
              {data.items.map((it) => (
                <button
                  key={it.key}
                  className="m-media-tile"
                  onClick={() => setViewer(it.key)}
                  onContextMenu={(e) => { e.preventDefault(); remove(it) }}
                >
                  <img src={fileUrl(it.key)} alt={it.name} loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {isVideo &&
            data.items.map((it) => (
              <div key={it.key} className="m-video-card">
                <video src={fileUrl(it.key)} controls preload="metadata" playsInline />
                <div className="m-video-meta">
                  <span className="m-video-name">{it.name}</span>
                  <button className="m-media-del" onClick={() => remove(it)}>Delete</button>
                </div>
              </div>
            ))}

          {area === 'files' &&
            data.items.map((it) => (
              <div key={it.key} className="m-file-row">
                <a className="m-file-open" href={fileUrl(it.key)} target="_blank" rel="noreferrer">
                  <FileIcon />
                  <span className="m-file-name">{it.name}</span>
                  <span className="m-file-size">{fmtSize(it.size)}</span>
                </a>
                <button className="m-nb-del" onClick={() => remove(it)} aria-label="Delete">✕</button>
              </div>
            ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT[area]}
        multiple
        style={{ display: 'none' }}
        onChange={onPick}
      />

      {viewer && (
        <div className="m-lightbox" onClick={() => setViewer(null)}>
          <img src={fileUrl(viewer)} alt="" />
        </div>
      )}
    </div>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 16V5M8 9l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  )
}
function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 7a1 1 0 0 1 1-1h4l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}
