// Per-area thumbnail size, persisted so the choice sticks between sessions.
const key = (area) => `jotter-thumbsize-${area}`

export function getThumbSize(area, fallback) {
  const v = parseInt(localStorage.getItem(key(area)), 10)
  return Number.isFinite(v) ? v : fallback
}

export function setThumbSize(area, px) {
  localStorage.setItem(key(area), String(px))
}
