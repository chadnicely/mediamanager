// Full-screen search overlay — matches note titles and body text, tap to open.

import { useMemo, useRef, useEffect, useState } from 'react'
import { preview, plainText, formatDate } from '../lib/noteText.js'

export default function MobileSearch({ notes, onOpen, onNoteMenu, onClose }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const pressTimer = useRef(null)
  const longFired = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
    if (longFired.current) {
      longFired.current = false
      return
    }
    onOpen(note.id)
  }

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return notes
      .filter(
        (n) =>
          (n.title || '').toLowerCase().includes(term) ||
          plainText(n.body).toLowerCase().includes(term)
      )
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 100)
  }, [notes, q])

  return (
    <div className="m-search-screen">
      <header className="m-search-bar">
        <button className="m-icon-btn" onClick={onClose} aria-label="Close search">
          <BackIcon />
        </button>
        <input
          ref={inputRef}
          className="m-search-input"
          placeholder="Find any note"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="m-icon-btn" onClick={() => setQ('')} aria-label="Clear">
            ✕
          </button>
        )}
      </header>

      <div className="m-list">
        {q.trim() && results.length === 0 && (
          <div className="m-empty">
            <p>No notes match “{q.trim()}”</p>
          </div>
        )}
        {results.map((n) => (
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
            <div className="m-note-title">{n.title || 'Untitled'}</div>
            <div className="m-note-preview">{preview(n.body)}</div>
            <div className="m-note-date">{formatDate(n.updatedAt)}</div>
          </button>
        ))}
      </div>
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
