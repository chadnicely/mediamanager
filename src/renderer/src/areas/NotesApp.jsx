import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, newId } from '../lib/storage.js'
import { parseEnex } from '../lib/enex.js'
import Sidebar from '../components/Sidebar.jsx'
import NoteList from '../components/NoteList.jsx'
import NoteSearch from '../components/NoteSearch.jsx'
import Editor from '../components/Editor.jsx'

function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

// Strip HTML so body search matches visible text, not tag names.
function plainText(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function NotesApp() {
  const [notebooks, setNotebooks] = useState([])
  const [notes, setNotes] = useState([])
  const [activeNotebook, setActiveNotebook] = useState('all')
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl/Cmd+K opens the quick-search palette.
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openNoteFromSearch(id) {
    setActiveNotebook('all')
    setSearch('')
    setActiveNoteId(id)
    setSearchOpen(false)
  }

  const saveTimer = useRef(null)
  const fileInputRef = useRef(null)

  // Import Evernote .enex export(s): one group per file, text + formatting.
  async function handleImportFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // let the same file be re-selected later
    if (!files.length) return
    setImportMsg('Importing…')
    const newNotebooks = []
    const newNotes = []
    let skipped = 0
    let errored = 0
    for (const file of files) {
      try {
        const text = await readText(file)
        const { notes: parsed, skippedAttachments, error } = parseEnex(text)
        if (error) {
          errored++
          continue
        }
        const nb = { id: newId(), name: file.name.replace(/\.enex$/i, '') || 'Imported' }
        newNotebooks.push(nb)
        skipped += skippedAttachments
        for (const n of parsed) {
          newNotes.push({
            id: newId(),
            notebookId: nb.id,
            title: n.title,
            body: n.body,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt
          })
        }
      } catch {
        errored++
      }
    }
    if (newNotebooks.length) setNotebooks((prev) => [...prev, ...newNotebooks])
    if (newNotes.length) setNotes((prev) => [...newNotes, ...prev])
    const parts = [
      `Imported ${newNotes.length} note${newNotes.length === 1 ? '' : 's'} into ${newNotebooks.length} group${newNotebooks.length === 1 ? '' : 's'}.`
    ]
    if (skipped) parts.push(`${skipped} attachment${skipped === 1 ? '' : 's'} skipped (text-only import).`)
    if (errored) parts.push(`${errored} file${errored === 1 ? '' : 's'} couldn’t be read.`)
    setImportMsg(parts.join(' '))
    setTimeout(() => setImportMsg(''), 9000)
  }

  useEffect(() => {
    loadData().then((data) => {
      setNotebooks(data.notebooks || [])
      setNotes(data.notes || [])
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveData({ notebooks, notes })
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [notebooks, notes, loaded])

  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase()
    const searching = q.length > 0
    return notes
      .filter(
        (n) =>
          searching ||
          activeNotebook === 'all' ||
          (activeNotebook === 'favorites' ? n.favorite : n.notebookId === activeNotebook)
      )
      .filter((n) => {
        if (!searching) return true
        return (
          (n.title || '').toLowerCase().includes(q) ||
          plainText(n.body).toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  }, [notes, activeNotebook, search])

  const activeNote = notes.find((n) => n.id === activeNoteId) || null

  function createNote() {
    const notebookId = activeNotebook === 'all' || activeNotebook === 'favorites' ? 'default' : activeNotebook
    const note = {
      id: newId(),
      notebookId,
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setNotes((prev) => [note, ...prev])
    setActiveNoteId(note.id)
    setSearch('')
  }

  function updateNote(id, patch) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
    )
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    if (activeNoteId === id) setActiveNoteId(null)
  }

  function toggleFavorite(id) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, favorite: !n.favorite } : n)))
  }

  function moveNote(id, notebookId) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, notebookId } : n)))
  }

  function createNotebook(name) {
    if (!name || !name.trim()) return
    const nb = { id: newId(), name: name.trim() }
    setNotebooks((prev) => [...prev, nb])
    setActiveNotebook(nb.id)
  }

  function deleteNotebook(id) {
    if (!window.confirm('Delete this group? Its notes stay under All Notes.')) return
    setNotebooks((prev) => prev.filter((nb) => nb.id !== id))
    if (activeNotebook === id) setActiveNotebook('all')
  }

  const counts = useMemo(() => {
    const map = { all: notes.length, favorites: 0 }
    for (const nb of notebooks) {
      map[nb.id] = notes.filter((n) => n.notebookId === nb.id).length
    }
    for (const n of notes) if (n.favorite) map.favorites++
    return map
  }, [notes, notebooks])

  return (
    <div className="notes-area">
      <Sidebar
        notebooks={notebooks}
        activeNotebook={activeNotebook}
        counts={counts}
        onSelectNotebook={setActiveNotebook}
        onNewNote={createNote}
        onCreateNotebook={createNotebook}
        onDeleteNotebook={deleteNotebook}
        onImport={() => fileInputRef.current?.click()}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".enex"
        multiple
        style={{ display: 'none' }}
        onChange={handleImportFiles}
      />
      {importMsg && <div className="toast">{importMsg}</div>}
      <NoteList
        notes={visibleNotes}
        activeNoteId={activeNoteId}
        search={search}
        onSearch={setSearch}
        onSelect={setActiveNoteId}
        onNewNote={createNote}
        onDelete={deleteNote}
        onToggleFavorite={toggleFavorite}
        notebooks={notebooks}
        onMove={moveNote}
        onOpenSearch={() => setSearchOpen(true)}
      />
      {searchOpen && (
        <NoteSearch
          notes={notes}
          notebooks={notebooks}
          onOpen={openNoteFromSearch}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <Editor
        note={activeNote}
        notebooks={notebooks}
        onChange={updateNote}
        onDelete={deleteNote}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  )
}
