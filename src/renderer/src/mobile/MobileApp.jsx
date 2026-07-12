// Mobile shell — Evernote-style bottom-tab app that reuses the shared notes
// store. Renders on narrow viewports (see App.jsx). Tabs: Create · Notes ·
// Notebooks · More, with a full-screen editor and search overlay layered on top.

import { useRef, useState } from 'react'
import './mobile.css'
import { useNotesStore } from '../lib/useNotesStore.js'
import { parseEnex } from '../lib/enex.js'
import { newId } from '../lib/storage.js'
import { showPrompt } from '../lib/prompt.js'
import MobileTabBar from './MobileTabBar.jsx'
import MobileHome from './MobileHome.jsx'
import MobileNotes from './MobileNotes.jsx'
import MobileNotebooks from './MobileNotebooks.jsx'
import MobileEditor from './MobileEditor.jsx'
import MobileMore from './MobileMore.jsx'
import MobileSearch from './MobileSearch.jsx'
import MobileNoteSheet from './MobileNoteSheet.jsx'
import MobileMedia from './MobileMedia.jsx'

function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(r.error)
    r.readAsText(file)
  })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c])
}

export default function MobileApp({ user, onSignOut }) {
  const store = useNotesStore()
  const [tab, setTab] = useState('create') // create | notes | notebooks | more
  const [scope, setScope] = useState('all') // which notebook the Notes list shows
  const [activeNoteId, setActiveNoteId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuNote, setMenuNote] = useState(null) // note whose actions sheet is open
  const [mediaArea, setMediaArea] = useState(null) // open cloud media gallery (images/videos/…)
  const [toast, setToast] = useState('')

  const enexInputRef = useRef(null)
  const cameraInputRef = useRef(null)

  const activeNote = store.notes.find((n) => n.id === activeNoteId) || null

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  function openNote(id) {
    setActiveNoteId(id)
    setSearchOpen(false)
  }

  function newNote(patch) {
    const notebookId = scope === 'all' || scope === 'favorites' ? 'default' : scope
    const note = store.createNote(notebookId, patch)
    setActiveNoteId(note.id)
  }

  async function newNotebook() {
    const name = await showPrompt({ message: 'Notebook name', defaultValue: '' })
    const nb = store.createNotebook(name)
    if (nb) {
      setScope(nb.id)
      setTab('notebooks')
    }
  }

  function openScope(id) {
    setScope(id)
    setTab('notes')
  }

  // ---- Evernote .enex import (text + formatting; attachments skipped) ----
  async function handleEnexFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    flash('Importing…')
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
    store.addImported({ notebooks: newNotebooks, notes: newNotes })
    const parts = [
      `Imported ${newNotes.length} note${newNotes.length === 1 ? '' : 's'} into ${newNotebooks.length} group${newNotebooks.length === 1 ? '' : 's'}.`
    ]
    if (skipped) parts.push(`${skipped} attachment${skipped === 1 ? '' : 's'} skipped.`)
    if (errored) parts.push(`${errored} file${errored === 1 ? '' : 's'} couldn’t be read.`)
    flash(parts.join(' '))
    if (newNotes.length) {
      setScope('all')
      setTab('notes')
    }
  }

  // ---- Camera / photo → new note with the image embedded ----
  function handleCameraFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      newNote({
        title: '',
        body: `<img src="${reader.result}" alt="${escapeHtml(file.name)}">`
      })
    }
    reader.readAsDataURL(file)
  }

  function confirmDeleteNotebook(nb) {
    if (!window.confirm(`Delete “${nb.name}”? Its notes stay under All Notes.`)) return
    store.deleteNotebook(nb.id)
    if (scope === nb.id) setScope('all')
  }

  async function renameNotebook(nb) {
    const name = await showPrompt({ message: 'Rename notebook', defaultValue: nb.name })
    if (name && name.trim()) store.renameNotebook(nb.id, name)
  }

  // Full-screen cloud media gallery.
  if (mediaArea) {
    return (
      <div className="m-app">
        <MobileMedia area={mediaArea} onBack={() => setMediaArea(null)} />
      </div>
    )
  }

  // Full-screen editor takes over everything when a note is open.
  if (activeNote) {
    return (
      <div className="m-app">
        <MobileEditor
          note={activeNote}
          notebooks={store.notebooks}
          onChange={store.updateNote}
          onDelete={store.deleteNote}
          onToggleFavorite={store.toggleFavorite}
          onBack={() => setActiveNoteId(null)}
        />
      </div>
    )
  }

  return (
    <div className="m-app">
      {tab === 'create' && (
        <MobileHome
          user={user}
          counts={{
            notes: store.notes.length,
            notebooks: store.notebooks.length
          }}
          onNewNote={() => newNote()}
          onCamera={() => cameraInputRef.current?.click()}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSpace={(id) => {
            if (id === 'notes') {
              setScope('all')
              setTab('notes')
            } else if (id === 'notebooks') {
              setTab('notebooks')
            } else {
              setMediaArea(id)
            }
          }}
        />
      )}

      {tab === 'notes' && (
        <MobileNotes
          notes={store.notes}
          notebooks={store.notebooks}
          scopeId={scope}
          search=""
          onSelect={openNote}
          onNewNote={() => newNote()}
          onOpenSearch={() => setSearchOpen(true)}
          onNoteMenu={setMenuNote}
          onBack={scope !== 'all' ? () => setScope('all') : null}
        />
      )}

      {tab === 'notebooks' && (
        <MobileNotebooks
          notebooks={store.notebooks}
          counts={store.counts}
          onOpenScope={openScope}
          onNewNotebook={newNotebook}
          onRenameNotebook={renameNotebook}
          onDeleteNotebook={confirmDeleteNotebook}
        />
      )}

      {tab === 'more' && (
        <MobileMore
          user={user}
          notesCount={store.notes.length}
          notebooksCount={store.notebooks.length}
          onImport={() => enexInputRef.current?.click()}
          onOpenMedia={setMediaArea}
          onSignOut={onSignOut}
        />
      )}

      <MobileTabBar active={tab} onChange={setTab} />

      {searchOpen && (
        <MobileSearch
          notes={store.notes}
          onOpen={openNote}
          onNoteMenu={setMenuNote}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {menuNote && (
        <MobileNoteSheet
          note={store.notes.find((n) => n.id === menuNote.id) || menuNote}
          notebooks={store.notebooks}
          onFavorite={store.toggleFavorite}
          onMove={store.moveNote}
          onDelete={store.deleteNote}
          onClose={() => setMenuNote(null)}
        />
      )}

      {toast && <div className="m-toast">{toast}</div>}

      <input
        ref={enexInputRef}
        type="file"
        accept=".enex"
        multiple
        style={{ display: 'none' }}
        onChange={handleEnexFiles}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleCameraFile}
      />
    </div>
  )
}
