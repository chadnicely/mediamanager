// Bottom-sheet actions for a note (long-press / right-click on a list row):
// favorite, move to a notebook, delete. Reuses the shared .m-sheet styles.

import { useState } from 'react'

export default function MobileNoteSheet({ note, notebooks, onFavorite, onMove, onDelete, onClose }) {
  const [moveOpen, setMoveOpen] = useState(false)
  if (!note) return null

  return (
    <div className="m-sheet" onClick={onClose}>
      <div className="m-sheet-panel" onClick={(e) => e.stopPropagation()}>
        {!moveOpen ? (
          <>
            <div className="m-sheet-title">{note.title || 'Untitled'}</div>
            <button
              className="m-sheet-item"
              onClick={() => {
                onFavorite(note.id)
                onClose()
              }}
            >
              {note.favorite ? 'Remove from favorites' : 'Add to favorites'}
            </button>
            <button className="m-sheet-item" onClick={() => setMoveOpen(true)}>
              Move to notebook…
            </button>
            <button
              className="m-sheet-item danger"
              onClick={() => {
                if (window.confirm('Delete this note?')) {
                  onDelete(note.id)
                  onClose()
                }
              }}
            >
              Delete note
            </button>
          </>
        ) : (
          <>
            <div className="m-sheet-title">Move to notebook</div>
            {notebooks.map((nb) => (
              <button
                key={nb.id}
                className="m-sheet-item"
                onClick={() => {
                  onMove(note.id, nb.id)
                  onClose()
                }}
              >
                {nb.id === note.notebookId ? '✓ ' : ''}
                {nb.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
