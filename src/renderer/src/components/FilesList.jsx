// Extract every embedded image across all notes into a flat, browsable list.
function extractFiles(notes, notebooks) {
  const nbName = (id) => notebooks.find((n) => n.id === id)?.name || 'Notebook'
  const parser = new DOMParser()
  const items = []
  for (const note of notes) {
    if (!note.body) continue
    const doc = parser.parseFromString(note.body, 'text/html')
    doc.querySelectorAll('img').forEach((img, i) => {
      const src = img.getAttribute('src')
      if (!src) return
      items.push({
        key: `${note.id}-${i}`,
        noteId: note.id,
        noteTitle: note.title || 'Untitled',
        notebook: nbName(note.notebookId),
        alt: img.getAttribute('alt') || 'Image',
        src,
        date: note.updatedAt
      })
    })
  }
  return items.sort((a, b) => (b.date || 0) - (a.date || 0))
}

export default function FilesList({ notes, notebooks, activeNoteId, onSelect }) {
  const files = extractFiles(notes, notebooks)

  return (
    <section className="notelist">
      <div className="notelist-header files-header">
        <span>
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="files-grid">
        {files.length === 0 && (
          <div className="notelist-empty">
            <p>No files yet</p>
            <span className="files-hint">Insert an image into a note to see it here.</span>
          </div>
        )}

        {files.map((f) => (
          <button
            key={f.key}
            className={`file-card ${f.noteId === activeNoteId ? 'active' : ''}`}
            title={`${f.alt} — in “${f.noteTitle}”`}
            onClick={() => onSelect(f.noteId)}
          >
            <div className="file-thumb">
              <img src={f.src} alt={f.alt} />
            </div>
            <div className="file-meta">
              <div className="file-note-title">{f.noteTitle}</div>
              <div className="file-notebook">{f.notebook}</div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
