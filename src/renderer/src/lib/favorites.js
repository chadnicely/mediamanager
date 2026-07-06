// Per-area favorites, stored locally. IDs are item subs (library areas) or
// capture ids (screenshots). (Later these sync to the account.)

const key = (area) => `jotter-favs-${area}`

export function getFavs(area) {
  try {
    return JSON.parse(localStorage.getItem(key(area))) || []
  } catch {
    return []
  }
}

export function isFav(area, id) {
  return getFavs(area).includes(id)
}

export function toggleFav(area, id) {
  const favs = getFavs(area)
  const i = favs.indexOf(id)
  if (i >= 0) favs.splice(i, 1)
  else favs.push(id)
  localStorage.setItem(key(area), JSON.stringify(favs))
  return favs
}
