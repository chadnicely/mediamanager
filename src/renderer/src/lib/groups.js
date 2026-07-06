// Per-area "groups" (like Notebooks for Notes). Stored locally for now;
// for bucket-backed areas a group name maps to a top-level folder/prefix.
// (Later these sync to the user's account.)

const key = (area) => `jotter-groups-${area}`

export function safeName(name) {
  return String(name || '').trim().replace(/[\\/]+/g, '-')
}

export function getGroups(area) {
  try {
    return JSON.parse(localStorage.getItem(key(area))) || []
  } catch {
    return []
  }
}

export function saveGroups(area, groups) {
  localStorage.setItem(key(area), JSON.stringify([...new Set(groups)]))
}

export function removeGroup(area, name) {
  const groups = getGroups(area).filter((g) => g !== name)
  saveGroups(area, groups)
  return groups
}

export function addGroup(area, name) {
  const n = safeName(name)
  if (!n) return getGroups(area)
  const groups = getGroups(area)
  if (!groups.includes(n)) groups.push(n)
  saveGroups(area, groups)
  return groups
}

// Replace the stored groups with exactly the folders that exist. For local
// libraries a group IS a folder, so this is the source of truth — it drops any
// stale names left over from a previous library location.
export function syncGroups(area, names) {
  const clean = [...new Set(names.map(safeName).filter(Boolean))]
  saveGroups(area, clean)
  return clean
}

// Merge in group names discovered in the bucket (top-level folders), so the
// sidebar reflects what's actually there plus anything the user created.
export function mergeGroups(area, names) {
  const groups = getGroups(area)
  let changed = false
  for (const raw of names) {
    const n = safeName(raw)
    if (n && !groups.includes(n)) {
      groups.push(n)
      changed = true
    }
  }
  if (changed) saveGroups(area, groups)
  return groups
}
