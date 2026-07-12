// Notes sync client. Pushes locally-changed notes/notebooks to the hosted
// backend and pulls back anything changed on the server, merging by id with
// last-write-wins. Deletes travel as tombstones (deleted:true) so they
// propagate. Never throws — a failed sync just leaves local state untouched.

import { getToken, apiBase } from './auth.js'

const SINCE_KEY = 'sniddy-sync-since'

export function syncEnabled() {
  return !!getToken()
}

function getSince() {
  return Number(localStorage.getItem(SINCE_KEY)) || 0
}

function toServerNote(n) {
  return {
    cid: n.id,
    notebookId: n.notebookId || 'default',
    title: n.title || '',
    body: n.body || '',
    favorite: !!n.favorite,
    deleted: !!n.deleted,
    createdAt: n.createdAt || 0,
    updatedAt: n.updatedAt || 0
  }
}
function toServerNotebook(nb) {
  const ts = nb.updatedAt || nb.createdAt || 0
  return { cid: nb.id, name: nb.name || '', deleted: !!nb.deleted, createdAt: nb.createdAt || ts, updatedAt: ts }
}
function fromServerNote(s) {
  return {
    id: s.cid,
    notebookId: s.notebookId || 'default',
    title: s.title || '',
    body: s.body || '',
    favorite: !!s.favorite,
    deleted: !!s.deleted,
    createdAt: s.createdAt || 0,
    updatedAt: s.updatedAt || 0
  }
}
function fromServerNotebook(s) {
  return { id: s.cid, name: s.name || '', deleted: !!s.deleted, createdAt: s.createdAt || 0, updatedAt: s.updatedAt || 0 }
}

// Merge incoming (server) items into local by id, keeping the newer by updatedAt.
// Tombstones are kept (so deletes keep propagating); callers hide deleted items.
function mergeById(local, incoming) {
  const map = new Map(local.map((x) => [x.id, x]))
  for (const inc of incoming) {
    const cur = map.get(inc.id)
    if (!cur || (inc.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(inc.id, { ...cur, ...inc })
  }
  return [...map.values()]
}

// Returns { changed, notes, notebooks } or null (not signed in / error).
// `changed` is true only when the server sent updates we merged in.
export async function runSync(notes, notebooks) {
  const token = getToken()
  if (!token) return null
  const since = getSince()
  try {
    const body = {
      since,
      // Only push what changed since our last sync (all of it on the first run).
      notebooks: notebooks.filter((nb) => (nb.updatedAt || nb.createdAt || 0) > since).map(toServerNotebook),
      notes: notes.filter((n) => (n.updatedAt || 0) > since).map(toServerNote)
    }
    const res = await fetch(`${apiBase()}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.now) localStorage.setItem(SINCE_KEY, String(data.now))
    const srvNotes = (data.notes || []).map(fromServerNote)
    const srvNbs = (data.notebooks || []).map(fromServerNotebook)
    if (!srvNotes.length && !srvNbs.length) return { changed: false, notes, notebooks }
    return {
      changed: true,
      notes: mergeById(notes, srvNotes),
      notebooks: mergeById(notebooks, srvNbs)
    }
  } catch {
    return null
  }
}

// Clear the sync cursor (e.g. on sign-out) so the next login re-pulls everything.
export function resetSync() {
  try {
    localStorage.removeItem(SINCE_KEY)
  } catch {
    /* ignore */
  }
}
