// Notebooks tab — list of groups with note counts, plus All Notes / Favorites
// shortcuts at the top. Tapping a row opens that notebook's note list; the
// per-group ⋯ button opens a Rename / Delete actions sheet.

import { useState } from 'react'

export default function MobileNotebooks({
  notebooks,
  counts,
  onOpenScope,
  onNewNotebook,
  onRenameNotebook,
  onDeleteNotebook
}) {
  const [menuNb, setMenuNb] = useState(null) // notebook whose actions sheet is open

  const sorted = [...notebooks].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  return (
    <div className="m-screen">
      <header className="m-topbar">
        <div className="m-avatar">S</div>
        <div className="m-topbar-title">Notebooks</div>
        <button className="m-icon-btn" onClick={onNewNotebook} aria-label="New notebook">
          <PlusIcon />
        </button>
      </header>

      <div className="m-list-count">
        {sorted.length} {sorted.length === 1 ? 'notebook' : 'notebooks'}
      </div>

      <div className="m-list">
        <button className="m-nb-row" onClick={() => onOpenScope('all')}>
          <BookIcon />
          <span className="m-nb-name">All Notes</span>
          <span className="m-nb-count">{counts.all ?? 0}</span>
        </button>
        <button className="m-nb-row" onClick={() => onOpenScope('favorites')}>
          <StarIcon />
          <span className="m-nb-name">Favorites</span>
          <span className="m-nb-count">{counts.favorites ?? 0}</span>
        </button>

        <div className="m-list-divider">Groups</div>

        {sorted.length === 0 && (
          <div className="m-empty">
            <p>No groups yet.</p>
            <button className="m-link" onClick={onNewNotebook}>
              Create a notebook
            </button>
          </div>
        )}

        {sorted.map((nb) => (
          <div key={nb.id} className="m-nb-row m-nb-row-group">
            <button className="m-nb-open" onClick={() => onOpenScope(nb.id)}>
              <BookIcon />
              <span className="m-nb-name">{nb.name}</span>
              <span className="m-nb-count">{counts[nb.id] ?? 0}</span>
            </button>
            <button
              className="m-nb-del"
              aria-label={`Actions for ${nb.name}`}
              onClick={() => setMenuNb(nb)}
            >
              <DotsIcon />
            </button>
          </div>
        ))}
      </div>

      <button className="m-fab" onClick={onNewNotebook} aria-label="New notebook">
        <BookPlusIcon />
      </button>

      {menuNb && (
        <div className="m-sheet" onClick={() => setMenuNb(null)}>
          <div className="m-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="m-sheet-title">{menuNb.name}</div>
            <button
              className="m-sheet-item"
              onClick={() => {
                const nb = menuNb
                setMenuNb(null)
                onRenameNotebook(nb)
              }}
            >
              Rename
            </button>
            <button
              className="m-sheet-item danger"
              onClick={() => {
                const nb = menuNb
                setMenuNb(null)
                onDeleteNotebook(nb)
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 4h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 4v17" />
    </svg>
  )
}
function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L4 9.3l6-.7L12 3z" strokeLinejoin="round" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}
function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </svg>
  )
}
function BookPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h9a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M16 8h4M18 6v4" strokeLinecap="round" />
    </svg>
  )
}
