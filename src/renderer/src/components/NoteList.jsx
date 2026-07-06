function preview(html) {
  const text = (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  return text || 'No additional text'
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

// Escape text, then wrap query matches in <mark>.
function highlight(text, query) {
  const safe = escapeHtml(text)
  const term = query.trim()
  if (!term) return safe
  const pattern = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safe.replace(new RegExp(`(${pattern})`, 'ig'), '<mark>$1</mark>')
}

import { useEffect, useState } from 'react'

export default function NoteList({
  notes,
  activeNoteId,
  search,
  onSearch,
  onSelect,
  onNewNote,
  onDelete,
  onToggleFavorite,
  notebooks = [],
  onMove
}) {
  const searching = search.trim().length > 0
  const [menu, setMenu] = useState(null) // { x, y, noteId, title, favorite, notebookId, groupOpen }

  function openMenu(e, note) {
    e.preventDefault()
    setMenu({
      x: e.clientX,
      y: e.clientY,
      noteId: note.id,
      title: note.title || 'Untitled',
      favorite: !!note.favorite,
      notebookId: note.notebookId,
      groupOpen: false
    })
  }

  // Dismiss the context menu on any outside click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function confirmDelete() {
    if (menu && window.confirm(`Delete “${menu.title}”?`)) onDelete(menu.noteId)
    setMenu(null)
  }

  return (
    <section className="notelist">
      <div className="notelist-search">
        <div className="search-field">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search all notes"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searching && (
            <button className="search-clear" title="Clear search" onClick={() => onSearch('')}>
              ×
            </button>
          )}
        </div>
      </div>

      <div className="notelist-header">
        {searching ? (
          <span>
            {notes.length} result{notes.length === 1 ? '' : 's'} for “{search.trim()}”
          </span>
        ) : (
          <span>
            {notes.length} note{notes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="notelist-items">
        {notes.length === 0 &&
          (searching ? (
            <div className="notelist-empty">
              <p>No notes match “{search.trim()}”</p>
              <button className="link-btn" onClick={() => onSearch('')}>
                Clear search
              </button>
            </div>
          ) : (
            <div className="notelist-empty">
              <p>No notes yet</p>
              <button className="link-btn" onClick={onNewNote}>
                Create your first note
              </button>
            </div>
          ))}

        {notes.map((n) => (
          <button
            key={n.id}
            className={`note-card ${n.id === activeNoteId ? 'active' : ''}`}
            onClick={() => onSelect(n.id)}
            onContextMenu={(e) => openMenu(e, n)}
          >
            <div className="note-card-title">
              {n.favorite && <span className="note-fav">★</span>}
              <span
                dangerouslySetInnerHTML={{
                  __html: highlight(n.title || 'Untitled', search)
                }}
              />
            </div>
            <div
              className="note-card-preview"
              dangerouslySetInnerHTML={{ __html: highlight(preview(n.body), search) }}
            />
            <div className="note-card-date">{formatDate(n.updatedAt)}</div>
          </button>
        ))}
      </div>

      {menu && (
        <div
          className="context-menu"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="context-item"
            onClick={() => {
              onToggleFavorite(menu.noteId)
              setMenu(null)
            }}
          >
            {menu.favorite ? 'Remove from favorites' : 'Add to favorites'}
          </button>

          <div className="context-item has-sub">
            <span>Add to group</span>
            <span className="sub-arrow">▸</span>
            <div className="context-submenu">
              {notebooks.map((nb) => (
                <button
                  key={nb.id}
                  className="context-item sub"
                  onClick={() => {
                    onMove(menu.noteId, nb.id)
                    setMenu(null)
                  }}
                >
                  {nb.id === menu.notebookId ? '✓ ' : ''}
                  {nb.name}
                </button>
              ))}
            </div>
          </div>

          <div className="context-divider" />
          <button className="context-item danger" onClick={confirmDelete}>
            Delete note
          </button>
        </div>
      )}
    </section>
  )
}
