import { useState } from 'react'
import BulkGroups from './BulkGroups.jsx'

export default function Sidebar({
  notebooks,
  activeNotebook,
  counts,
  onSelectNotebook,
  onNewNote,
  onCreateNotebook,
  onDeleteNotebook,
  onImport
}) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)

  function commit() {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) onCreateNotebook(name)
  }
  function cancel() {
    setCreating(false)
    setDraft('')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-avatar">S</div>
        <div className="brand-name">Sniddy</div>
      </div>

      <button className="new-note-btn" onClick={onNewNote}>
        + New Note
      </button>

      {onImport && (
        <button className="import-btn" title="Import notes from an Evernote .enex export" onClick={onImport}>
          ⬇ Import from Evernote
        </button>
      )}

      <nav className="nav">
        <button
          className={`nav-item ${activeNotebook === 'all' ? 'active' : ''}`}
          onClick={() => onSelectNotebook('all')}
        >
          <span>📝 All Notes</span>
          <span className="nav-count">{counts.all ?? 0}</span>
        </button>
        <button
          className={`nav-item ${activeNotebook === 'favorites' ? 'active' : ''}`}
          onClick={() => onSelectNotebook('favorites')}
        >
          <span>⭐ Favorites</span>
          <span className="nav-count">{counts.favorites ?? 0}</span>
        </button>
      </nav>

      <div className="nav-section">
        <div className="nav-section-head">
          <span>Groups</span>
          <span className="nav-section-actions">
            <button
              className="icon-btn"
              title="Add many (paste list or spreadsheet)"
              onClick={() => setBulkOpen(true)}
            >
              ▤
            </button>
            <button
              className="icon-btn"
              title="New group"
              onClick={() => {
                setDraft('')
                setCreating(true)
              }}
            >
              +
            </button>
          </span>
        </div>
        {creating && (
          <div className="group-create">
            <input
              className="group-create-input"
              autoFocus
              value={draft}
              placeholder="Group name…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
            />
            {draft.trim() && (
              <button
                className="group-create-ok"
                title="Create group"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commit}
              >
                ✓
              </button>
            )}
            <button
              className="group-create-cancel"
              title="Cancel"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
            >
              ✕
            </button>
          </div>
        )}

        {[...notebooks]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
          .map((nb) => (
            <div key={nb.id} className={`group-item ${activeNotebook === nb.id ? 'active' : ''}`}>
              <button className="group-select" onClick={() => onSelectNotebook(nb.id)}>
                <span className="nav-item-label">{nb.name}</span>
                <span className="nav-count">{counts[nb.id] ?? 0}</span>
              </button>
              <button
                className="group-del"
                title="Delete group"
                onClick={() => onDeleteNotebook(nb.id)}
              >
                🗑
              </button>
            </div>
          ))}
      </div>

      {bulkOpen && (
        <BulkGroups
          label="group"
          onCreateEach={(name) => onCreateNotebook(name)}
          onClose={() => setBulkOpen(false)}
          onDone={() => setBulkOpen(false)}
        />
      )}

      <button
        className="update-pill"
        title="Relaunch to update Sniddy"
        onClick={() => window.location.reload()}
      >
        <span className="update-icon">S</span>
        <span className="update-text">
          <span className="update-title">Relaunch to update</span>
          <span className="update-version">v0.1.0</span>
        </span>
        <span className="update-arrow">→</span>
      </button>
    </aside>
  )
}
