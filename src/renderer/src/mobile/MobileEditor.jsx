// Full-screen mobile note editor. Top app bar (back · notebook · favorite ·
// menu), a title field, the rich-text body, and a compact formatting toolbar
// docked at the bottom. Draft edits are flushed on blur / unmount / back.

import { useEffect, useRef, useState } from 'react'

const TOOLBAR = [
  { cmd: 'bold', label: 'B', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', style: { textDecoration: 'underline' } },
  { cmd: 'formatBlock', arg: 'H1', label: 'H1' },
  { cmd: 'formatBlock', arg: 'H2', label: 'H2' },
  { cmd: 'insertUnorderedList', label: '•' },
  { cmd: 'insertOrderedList', label: '1.' },
  { cmd: 'checkbox', label: '☑' },
  { cmd: 'removeFormat', label: '⌫' }
]

export default function MobileEditor({
  note,
  notebooks,
  onChange,
  onDelete,
  onToggleFavorite,
  onBack
}) {
  const bodyRef = useRef(null)
  const draftRef = useRef({ id: null, title: '', body: '' })
  const [title, setTitle] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [nbOpen, setNbOpen] = useState(false)

  function flush() {
    const d = draftRef.current
    if (d.id) onChange(d.id, { title: d.title, body: d.body })
  }

  function syncBody() {
    if (bodyRef.current) draftRef.current.body = bodyRef.current.innerHTML
  }

  // Load the note into the draft + DOM when it changes.
  useEffect(() => {
    if (!note) return
    draftRef.current = { id: note.id, title: note.title || '', body: note.body || '' }
    setTitle(note.title || '')
    if (bodyRef.current) bodyRef.current.innerHTML = note.body || ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  // Flush on unmount so nothing is lost when leaving the editor.
  useEffect(() => {
    return () => {
      const d = draftRef.current
      if (d.id) onChange(d.id, { title: d.title, body: d.body })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!note) return null

  const notebookName = notebooks.find((n) => n.id === note.notebookId)?.name || 'My Notebook'

  function exec(item) {
    bodyRef.current?.focus()
    if (item.cmd === 'checkbox') {
      document.execCommand(
        'insertHTML',
        false,
        '<div class="todo"><input type="checkbox" contenteditable="false">&nbsp;</div>'
      )
    } else if (item.cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, item.arg)
    } else {
      document.execCommand(item.cmd, false, null)
    }
    syncBody()
  }

  function handleBodyClick(e) {
    const t = e.target
    if (t && t.matches && t.matches('input[type="checkbox"]')) {
      t.toggleAttribute('checked', t.checked)
      syncBody()
    }
  }

  function back() {
    flush()
    onBack()
  }

  return (
    <div className="m-editor">
      <header className="m-topbar m-editor-bar">
        <button className="m-icon-btn" onClick={back} aria-label="Back">
          <BackIcon />
        </button>

        <button className="m-nb-chip" onClick={() => setNbOpen((v) => !v)}>
          <span className="m-nb-chip-name">{notebookName}</span>
          <Caret />
        </button>

        <div className="m-editor-actions">
          <button
            className={`m-icon-btn ${note.favorite ? 'star-on' : ''}`}
            onClick={() => onToggleFavorite(note.id)}
            aria-label="Favorite"
          >
            {note.favorite ? '★' : '☆'}
          </button>
          <button className="m-icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="More">
            <DotsIcon />
          </button>
        </div>

        {nbOpen && (
          <div className="m-sheet" onClick={() => setNbOpen(false)}>
            <div className="m-sheet-panel" onClick={(e) => e.stopPropagation()}>
              <div className="m-sheet-title">Move to notebook</div>
              {notebooks.map((nb) => (
                <button
                  key={nb.id}
                  className="m-sheet-item"
                  onClick={() => {
                    onChange(note.id, {
                      notebookId: nb.id,
                      title: draftRef.current.title,
                      body: draftRef.current.body
                    })
                    setNbOpen(false)
                  }}
                >
                  {nb.id === note.notebookId ? '✓ ' : ''}
                  {nb.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {menuOpen && (
          <div className="m-sheet" onClick={() => setMenuOpen(false)}>
            <div className="m-sheet-panel" onClick={(e) => e.stopPropagation()}>
              <button
                className="m-sheet-item danger"
                onClick={() => {
                  if (window.confirm('Delete this note?')) {
                    onDelete(note.id)
                    onBack()
                  }
                  setMenuOpen(false)
                }}
              >
                Delete note
              </button>
            </div>
          </div>
        )}
      </header>

      <input
        className="m-editor-title"
        placeholder="Title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          draftRef.current.title = e.target.value
        }}
        onBlur={flush}
      />

      <div
        ref={bodyRef}
        className="m-editor-body"
        contentEditable
        suppressContentEditableWarning
        onInput={syncBody}
        onBlur={flush}
        onClick={handleBodyClick}
      />

      <div className="m-format-bar">
        {TOOLBAR.map((item, i) => (
          <button
            key={i}
            className="m-format-btn"
            style={item.style}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(item)}
          >
            {item.label}
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
function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  )
}
function Caret() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
