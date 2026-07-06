// Storage abstraction: uses the Electron IPC bridge when available,
// and falls back to localStorage so the UI also runs in a plain browser preview.

const LS_KEY = 'evernote-clone-data'

const emptyStore = () => ({
  notebooks: [{ id: 'default', name: 'My Notebook' }],
  notes: []
})

export async function loadData() {
  if (window.api?.loadData) {
    try {
      return await window.api.loadData()
    } catch {
      return emptyStore()
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : emptyStore()
  } catch {
    return emptyStore()
  }
}

export async function saveData(data) {
  if (window.api?.saveData) {
    try {
      return await window.api.saveData(data)
    } catch {
      return false
    }
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
