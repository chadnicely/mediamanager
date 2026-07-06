import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, newId } from '../lib/storage.js'
import Sidebar from '../components/Sidebar.jsx'
import NoteList from '../components/NoteList.jsx'
import Editor from '../components/Editor.jsx'

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

  const saveTimer = useRef(null)

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
      />
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
      />
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
