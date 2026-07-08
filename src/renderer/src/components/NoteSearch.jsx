import { useEffect, useMemo, useRef, useState } from 'react'

function plainText(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// A centered quick-search palette (Evernote-style): type to find a note, arrow
// keys to move, Enter to open. Shows each note's group for context.
export default function NoteSearch({ notes, notebooks, onOpen, onClose }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const nbName = (id) => notebooks.find((n) => n.id === id)?.name || ''

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = query
      ? notes.filter(
          (n) =>
            (n.title || '').toLowerCase().includes(query) ||
            plainText(n.body).toLowerCase().includes(query)
        )
      : [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return base.slice(0, 50)
  }, [q, notes])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    setSel(0)
  }, [q])
  useEffect(() => {
    listRef.current?.querySelector('.cmd-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  function onKey(e) {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(results.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[sel]
      if (r) onOpen(r.id)
    }
  }

  return (
    <div className="cmd-backdrop" onMouseDown={onClose}>
      <div className="cmd-panel" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmd-search">
          <span className="cmd-search-ico">⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all notes…"
          />
          <button className="cmd-close" title="Close (Esc)" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="cmd-results" ref={listRef}>
          <div className="cmd-section">{q.trim() ? 'Results' : 'Recent'}</div>
          {results.map((n, i) => (
            <button
              key={n.id}
              className={`cmd-item ${i === sel ? 'active' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => onOpen(n.id)}
            >
              <span className="cmd-item-ico">📄</span>
              <span className="cmd-item-title">{n.title || 'Untitled'}</span>
              {nbName(n.notebookId) && <span className="cmd-item-nb">▤ {nbName(n.notebookId)}</span>}
            </button>
          ))}
          {results.length === 0 && (
            <div className="cmd-empty">No notes match “{q.trim()}”.</div>
          )}
        </div>

        <div className="cmd-foot">
          <span>↑↓ Select</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
