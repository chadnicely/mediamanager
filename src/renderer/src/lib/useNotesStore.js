// Shared notes state: load/persist + CRUD for notebooks and notes.
// Extracted so both the desktop NotesApp and the mobile shell can drive the
// same local store (loadData/saveData) without duplicating the logic.

import { useEffect, useMemo, useRef, useState } from 'react'
import { loadData, saveData, newId } from './storage.js'

export function useNotesStore() {
  const [notebooks, setNotebooks] = useState([])
  const [notes, setNotes] = useState([])
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef(null)

  useEffect(() => {
    loadData().then((data) => {
      setNotebooks(data.notebooks || [])
      setNotes(data.notes || [])
      setLoaded(true)
    })
  }, [])

  // Debounced persistence — mirrors the desktop app's save cadence.
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveData({ notebooks, notes })
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [notebooks, notes, loaded])

  function createNote(notebookId = 'default', patch = {}) {
    const nb = notebookId === 'all' || notebookId === 'favorites' ? 'default' : notebookId
    const note = {
      id: newId(),
      notebookId: nb,
      title: '',
      body: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...patch
    }
    setNotes((prev) => [note, ...prev])
    return note
  }

  function updateNote(id, patch) {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
    )
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  function toggleFavorite(id) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, favorite: !n.favorite } : n)))
  }

  function moveNote(id, notebookId) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, notebookId } : n)))
  }

  function createNotebook(name) {
    const clean = (name || '').trim()
    if (!clean) return null
    const nb = { id: newId(), name: clean }
    setNotebooks((prev) => [...prev, nb])
    return nb
  }

  function deleteNotebook(id) {
    setNotebooks((prev) => prev.filter((nb) => nb.id !== id))
  }

  function renameNotebook(id, name) {
    const clean = (name || '').trim()
    if (!clean) return
    setNotebooks((prev) => prev.map((nb) => (nb.id === id ? { ...nb, name: clean } : nb)))
  }

  function addImported({ notebooks: nbs = [], notes: ns = [] }) {
    if (nbs.length) setNotebooks((prev) => [...prev, ...nbs])
    if (ns.length) setNotes((prev) => [...ns, ...prev])
  }

  const counts = useMemo(() => {
    const map = { all: notes.length, favorites: 0 }
    for (const nb of notebooks) {
      map[nb.id] = notes.filter((n) => n.notebookId === nb.id).length
    }
    for (const n of notes) if (n.favorite) map.favorites++
    return map
  }, [notes, notebooks])

  return {
    notebooks,
    notes,
    loaded,
    counts,
    createNote,
    updateNote,
    deleteNote,
    toggleFavorite,
    moveNote,
    createNotebook,
    deleteNotebook,
    renameNotebook,
    addImported
  }
}
