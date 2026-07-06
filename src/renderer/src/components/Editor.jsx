import { useEffect, useRef, useState } from 'react'
import { showPrompt } from '../lib/prompt.js'

const TOOLBAR = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 700 } },
  { cmd: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
  { sep: true },
  { cmd: 'formatBlock', arg: 'H1', label: 'H1', title: 'Heading 1' },
  { cmd: 'formatBlock', arg: 'H2', label: 'H2', title: 'Heading 2' },
  { cmd: 'formatBlock', arg: 'P', label: 'P', title: 'Paragraph' },
  { sep: true },
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bulleted list' },
  { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
  { sep: true },
  { cmd: 'removeFormat', label: 'Clear', title: 'Clear formatting' }
]

const TEXT_COLORS = [
  '#1d2125', '#6b7178', '#d1453b', '#e8830c',
  '#0f9d58', '#2563eb', '#8b3dcf', '#c2185b'
]
const HILITE_COLORS = ['#fff2a8', '#c7f0cf', '#cfe2ff', '#ffd6e7', '#ffe0b3']

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c])
}

export default function Editor({ note, notebooks, onChange, onDelete, onToggleFavorite }) {
  const bodyRef = useRef(null)
  const titleRef = useRef(null)
  const menuRef = useRef(null)
  const fileRef = useRef(null)
  const savedRange = useRef(null)
  // Local, uncommitted edits. Nothing propagates to the note list until we flush().
  const draftRef = useRef({ id: null, title: '', body: '' })
  const [title, setTitle] = useState('')
  const [openMenu, setOpenMenu] = useState(null) // 'text' | 'hilite' | 'insert' | null

  function flush() {
    const d = draftRef.current
    if (!d.id) return
    onChange(d.id, { title: d.title, body: d.body })
  }

  function syncBody() {
    if (bodyRef.current) draftRef.current.body = bodyRef.current.innerHTML
  }

  useEffect(() => {
    const prev = draftRef.current
    if (prev.id && prev.id !== (note?.id ?? null)) {
      onChange(prev.id, { title: prev.title, body: prev.body })
    }

    if (!note) {
      draftRef.current = { id: null, title: '', body: '' }
      setTitle('')
      return
    }

    draftRef.current = { id: note.id, title: note.title || '', body: note.body || '' }
    setTitle(note.title || '')
    if (bodyRef.current) bodyRef.current.innerHTML = note.body || ''
    if (!note.title && !note.body) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id])

  useEffect(() => {
    return () => {
      const d = draftRef.current
      if (d.id) onChange(d.id, { title: d.title, body: d.body })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close any open toolbar popover on an outside click.
  useEffect(() => {
    if (!openMenu) return
    function onDocDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [openMenu])

  if (!note) {
    return (
      <section className="editor editor-empty">
        <div className="editor-empty-inner">
          <h2>No note selected</h2>
          <p>Select a note from the list, or create a new one.</p>
        </div>
      </section>
    )
  }

  function exec(item) {
    if (item.cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, item.arg)
    } else {
      document.execCommand(item.cmd, false, null)
    }
    bodyRef.current?.focus()
    syncBody()
  }

  // ---- Insert actions ----
  function insertHtml(html) {
    bodyRef.current?.focus()
    document.execCommand('insertHTML', false, html)
    syncBody()
  }

  // Remember/restore the caret, since a prompt() or file dialog steals focus.
  function saveRange() {
    const s = window.getSelection()
    if (s && s.rangeCount && bodyRef.current?.contains(s.anchorNode)) {
      savedRange.current = s.getRangeAt(0).cloneRange()
    }
  }

  function restoreRange() {
    bodyRef.current?.focus()
    const r = savedRange.current
    if (r) {
      const s = window.getSelection()
      s.removeAllRanges()
      s.addRange(r)
    }
  }

  async function insertLink() {
    saveRange()
    const url = await showPrompt({ message: 'Link URL', defaultValue: 'https://' })
    if (!url) return
    restoreRange()
    const sel = window.getSelection()
    if (sel && sel.toString().length > 0) {
      document.execCommand('createLink', false, url)
    } else {
      insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`)
    }
    syncBody()
  }

  function handleImageFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again later
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      restoreRange()
      insertHtml(`<img src="${reader.result}" alt="${escapeHtml(file.name)}">`)
    }
    reader.readAsDataURL(file)
  }

  async function insertTable() {
    saveRange()
    const spec = await showPrompt({ message: 'Table size (rows x columns)', defaultValue: '3x3' })
    if (!spec) return
    const [r, c] = spec.toLowerCase().split('x').map((s) => parseInt(s.trim(), 10))
    if (!r || !c || r > 50 || c > 20) {
      window.alert('Enter something like 3x3 (max 50x20).')
      return
    }
    restoreRange()
    let html = '<table class="note-table"><tbody>'
    for (let i = 0; i < r; i++) {
      html += '<tr>'
      for (let j = 0; j < c; j++) html += '<td><br></td>'
      html += '</tr>'
    }
    html += '</tbody></table><p><br></p>'
    insertHtml(html)
  }

  function insertTOC() {
    const body = bodyRef.current
    if (!body) return
    const heads = [...body.querySelectorAll('h1, h2')]
    if (!heads.length) {
      window.alert('Add some headings (H1/H2) first, then insert a table of contents.')
      return
    }
    let html = '<div class="toc" contenteditable="false"><div class="toc-title">Table of Contents</div>'
    heads.forEach((h, i) => {
      if (!h.id) h.id = `toc-h-${i}`
      html += `<a class="toc-item ${h.tagName.toLowerCase()}" href="#${h.id}">${escapeHtml(
        h.textContent || 'Untitled'
      )}</a>`
    })
    html += '</div><p><br></p>'
    insertHtml(html)
  }

  const now = () => new Date()

  const INSERTS = [
    { label: 'Divider', run: () => document.execCommand('insertHorizontalRule') },
    { label: 'Quote', run: () => document.execCommand('formatBlock', false, 'BLOCKQUOTE') },
    { label: 'Checkbox', run: () => insertHtml('<div class="todo"><input type="checkbox" contenteditable="false">&nbsp;</div>') },
    { label: 'Code block', run: () => insertHtml('<pre class="code-block">code</pre><p><br></p>') },
    { label: 'Table', run: insertTable },
    { label: 'Table of contents', run: insertTOC },
    { label: 'Current date', run: () => insertHtml(now().toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })) },
    { label: 'Current time', run: () => insertHtml(now().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) }
  ]

  function runInsert(item) {
    bodyRef.current?.focus()
    item.run()
    syncBody()
    setOpenMenu(null)
  }

  // Apply a text color (foreColor) or highlight (hiliteColor) to the selection.
  function applyColor(cmd, color) {
    restoreRange()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand(cmd, false, color)
    syncBody()
    setOpenMenu(null)
  }

  function handleTitle(e) {
    setTitle(e.target.value)
    draftRef.current.title = e.target.value
  }

  function handleBodyInput() {
    syncBody()
  }

  // Toggle checkboxes (persist the checked attribute) and handle TOC link clicks.
  function handleBodyClick(e) {
    const t = e.target
    if (t && t.matches && t.matches('input[type="checkbox"]')) {
      t.toggleAttribute('checked', t.checked)
      syncBody()
      return
    }
    const anchor = t.closest && t.closest('a.toc-item')
    if (anchor) {
      e.preventDefault()
      const id = anchor.getAttribute('href').slice(1)
      const target = bodyRef.current?.querySelector(`#${CSS.escape(id)}`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <section className="editor">
      <div className="editor-topbar">
        <div className="topbar-left">
          <button
            className={`star-btn ${note.favorite ? 'on' : ''}`}
            title={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => onToggleFavorite(note.id)}
          >
            {note.favorite ? '★' : '☆'}
          </button>
          <select
            className="notebook-select"
          value={note.notebookId}
          onChange={(e) =>
            onChange(note.id, {
              notebookId: e.target.value,
              title: draftRef.current.title,
              body: draftRef.current.body
            })
          }
        >
          {notebooks.map((nb) => (
            <option key={nb.id} value={nb.id}>
              {nb.name}
            </option>
          ))}
          </select>
        </div>
        <button
          className="danger-btn"
          onClick={() => {
            if (window.confirm('Delete this note?')) onDelete(note.id)
          }}
        >
          Delete
        </button>
      </div>

      <input
        ref={titleRef}
        className="editor-title"
        placeholder="Title"
        value={title}
        onChange={handleTitle}
        onBlur={flush}
      />

      <div className="toolbar">
        {TOOLBAR.map((item, i) =>
          item.sep ? (
            <span key={i} className="toolbar-sep" />
          ) : (
            <button
              key={i}
              className="toolbar-btn"
              title={item.title}
              style={item.style}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec(item)}
            >
              {item.label}
            </button>
          )
        )}
        <span className="toolbar-sep" />
        <button
          className="toolbar-btn"
          title="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={insertLink}
        >
          🔗 Link
        </button>
        <button
          className="toolbar-btn"
          title="Insert image"
          onMouseDown={(e) => {
            e.preventDefault()
            saveRange()
          }}
          onClick={() => fileRef.current?.click()}
        >
          🖼 Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageFile}
        />
        <span className="toolbar-sep" />
        <div className="toolbar-menus" ref={menuRef}>
          <div className="menu-wrap">
            <button
              className="toolbar-btn color-btn"
              title="Text color"
              onMouseDown={(e) => {
                e.preventDefault()
                saveRange()
              }}
              onClick={() => setOpenMenu((o) => (o === 'text' ? null : 'text'))}
            >
              <span className="color-a">A</span>
              <span className="color-caret">▾</span>
            </button>
            {openMenu === 'text' && (
              <div className="swatch-menu" onMouseDown={(e) => e.preventDefault()}>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="swatch"
                    style={{ background: c }}
                    title={c}
                    onClick={() => applyColor('foreColor', c)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="menu-wrap">
            <button
              className="toolbar-btn color-btn"
              title="Highlight"
              onMouseDown={(e) => {
                e.preventDefault()
                saveRange()
              }}
              onClick={() => setOpenMenu((o) => (o === 'hilite' ? null : 'hilite'))}
            >
              <span className="hilite-mark">🖍</span>
              <span className="color-caret">▾</span>
            </button>
            {openMenu === 'hilite' && (
              <div className="swatch-menu" onMouseDown={(e) => e.preventDefault()}>
                {HILITE_COLORS.map((c) => (
                  <button
                    key={c}
                    className="swatch"
                    style={{ background: c }}
                    title={c}
                    onClick={() => applyColor('hiliteColor', c)}
                  />
                ))}
                <button
                  className="swatch swatch-none"
                  title="Remove highlight"
                  onClick={() => applyColor('hiliteColor', 'transparent')}
                >
                  ⌀
                </button>
              </div>
            )}
          </div>

          <div className="insert-wrap">
            <button
              className="toolbar-btn insert-btn"
              title="Insert"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenMenu((o) => (o === 'insert' ? null : 'insert'))}
            >
              + Insert ▾
            </button>
            {openMenu === 'insert' && (
              <div className="insert-menu" onMouseDown={(e) => e.preventDefault()}>
                {INSERTS.map((item) => (
                  <button
                    key={item.label}
                    className="insert-item"
                    onClick={() => runInsert(item)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={bodyRef}
        className="editor-body"
        contentEditable
        suppressContentEditableWarning
        onInput={handleBodyInput}
        onBlur={flush}
        onClick={handleBodyClick}
      />
    </section>
  )
}
