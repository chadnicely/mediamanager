import { useState } from 'react'
import BulkGroups from './BulkGroups.jsx'

// Shared 2-pane area chrome: a Notes-style left sidebar (brand, primary action,
// nav items, groups section) + a content region. Same menu as Notes.
export default function AreaLayout({ brand, title, action, nav = [], groups, children }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)

  function commit() {
    const name = draft.trim()
    setCreating(false)
    setDraft('')
    if (name) groups?.onCreate(name)
  }
  function cancel() {
    setCreating(false)
    setDraft('')
  }

  return (
    <div className="area-with-menu">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-avatar">{brand}</div>
          <div className="brand-name">{title}</div>
        </div>

        {action && (
          <button className="new-note-btn" onClick={action.onClick}>
            {action.label}
          </button>
        )}

        <nav className="nav">
          {nav.map((item) => (
            <button
              key={item.label}
              className={`nav-item ${item.active ? 'active' : ''}`}
              onClick={item.onClick}
            >
              <span>{item.label}</span>
              {item.count != null && <span className="nav-count">{item.count}</span>}
            </button>
          ))}
        </nav>

        {groups && (
          <div className="nav-section">
            <div className="nav-section-head">
              <span>Groups</span>
              <span className="nav-section-actions">
                {groups.area && (
                  <button
                    className="icon-btn"
                    title="Add many (paste list or spreadsheet)"
                    onClick={() => setBulkOpen(true)}
                  >
                    ▤
                  </button>
                )}
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

            {[...groups.items]
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
              .map((g) => (
                <div key={g.name} className={`group-item ${g.active ? 'active' : ''}`}>
                  <button className="group-select" onClick={g.onClick}>
                    <span className="nav-item-label">📁 {g.name}</span>
                    {g.count != null && <span className="nav-count">{g.count}</span>}
                  </button>
                  {groups.onDelete && (
                    <button
                      className="group-del"
                      title="Delete group"
                      onClick={() => groups.onDelete(g.name)}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </aside>

      <div className="area-content">{children}</div>

      {bulkOpen && groups?.area && (
        <BulkGroups
          area={groups.area}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false)
            groups.onBulkDone?.()
          }}
        />
      )}
    </div>
  )
}
