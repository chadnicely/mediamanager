// Notes tab — full-width list of notes (optionally scoped to a notebook),
// with a header count and a green floating "new note" button.

import { useMemo, useRef } from 'react'
import { preview, plainText, formatDate } from '../lib/noteText.js'

export default function MobileNotes({
  notes,
  notebooks,
  scopeId = 'all',
  search,
  onSelect,
  onNewNote,
  onOpenSearch,
  onNoteMenu,
  onBack
}) {
  // Long-press (or right-click) a row to open its actions sheet. Only one row
  // is pressed at a time, so a single component-level timer/flag is enough.
  const pressTimer = useRef(null)
  const longFired = useRef(false)

  function pressStart(note) {
    longFired.current = false
    pressTimer.current = setTimeout(() => {
      longFired.current = true
      onNoteMenu?.(note)
    }, 500)
  }
  function pressEnd() {
    clearTimeout(pressTimer.current)
  }
  function rowClick(note) {
    // Swallow the click that follows a long-press so we don't also open the note.
    if (longFired.current) {
      longFired.current = false
      return
    }
    onSelect(note.id)
  }
  const scopeName =
    scopeId === 'all'
      ? 'Notes'
      : scopeId === 'favorites'
        ? 'Favorites'
        : notebooks.find((n) => n.id === scopeId)?.name || 'Notes'

  const visible = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    return notes
      .filter((n) => {
        if (scopeId === 'all') return true
        if (scopeId === 'favorites') return !!n.favorite
        return n.notebookId === scopeId
      })
      .filter((n) => {
        if (!q) return true
        return (
          (n.title || '').toLowerCase().includes(q) ||
          plainText(n.body).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [notes, scopeId, search])

  return (
    <div className="m-screen">
      <header className="m-topbar">
        {onBack ? (
          <button className="m-icon-btn" onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
        ) : (
          <div className="m-avatar">S</div>
        )}
        <div className="m-topbar-title">{scopeName}</div>
        <button className="m-icon-btn" onClick={onOpenSearch} aria-label="Search">
          <SearchIcon />
        </button>
      </header>

      <div className="m-list-count">
        {visible.length} {visible.length === 1 ? 'note' : 'notes'}
      </div>

      <div className="m-list">
        {visible.length === 0 && (
          <div className="m-empty">
            <p>No notes here yet.</p>
            <button className="m-link" onClick={onNewNote}>
              Create a note
            </button>
          </div>
        )}
        {visible.map((n) => (
          <button
            key={n.id}
            className="m-note-row"
            onClick={() => rowClick(n)}
            onPointerDown={() => pressStart(n)}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={(e) => {
              e.preventDefault()
              onNoteMenu?.(n)
            }}
          >
            <div className="m-note-title">
              {n.favorite && <span className="m-note-star">★</span>}
              {n.title || 'Untitled'}
            </div>
            <div className="m-note-preview">{preview(n.body)}</div>
            <div className="m-note-date">{formatDate(n.updatedAt)}</div>
          </button>
        ))}
      </div>

      <button className="m-fab" onClick={onNewNote} aria-label="New note">
        <NewNoteIcon />
      </button>
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
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}
function NewNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M13 4v5h5" />
      <path d="M12 12v5M9.5 14.5h5" strokeLinecap="round" />
    </svg>
  )
}
