import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LibrarySetup from './LibrarySetup.jsx'
import { getGroups, addGroup, safeName } from '../lib/groups.js'
import { showPrompt } from '../lib/prompt.js'
import { CATEGORIES, CATEGORY_META } from '../lib/fileTypes.js'

function shortPath(p) {
  const parts = String(p).replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

function catOf(ext) {
  return Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(ext))
}
function iconFor(ext) {
  return CATEGORY_META[catOf(ext)]?.icon || '📄'
}
function isImage(ext) {
  return CATEGORIES.Image.includes(ext)
}
function mediaUrl(path) {
  return `jotter-media://f/?p=${encodeURIComponent(path)}`
}
// Cached, resized thumbnail — used everywhere except full-res zoom.
function thumbUrl(path, size) {
  return `jotter-media://f/?p=${encodeURIComponent(path)}&t=${size}`
}

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
  svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', flv: 'video/x-flv', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', webm: 'video/webm', m4v: 'video/x-m4v',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', ogg: 'audio/ogg', pdf: 'application/pdf'
}

function human(bytes) {
  if (!bytes) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function fmtDate(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

// ---- Duplicate detection ----
// Hamming distance between two hex fingerprints (differing bits).
function hamming(a, b) {
  let d = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d + Math.abs(a.length - b.length) * 4
}

// Strip " (1)", "-copy", " Copy 2" style suffixes so renamed copies group together.
function normalizeName(name) {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().trim()
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : ''
  const stripped = base
    .replace(/[\s_-]*\(\d+\)\s*$/, '')
    .replace(/[\s_-]*copy(\s*\d+)?\s*$/i, '')
    .trim()
  return (stripped || base) + ext
}

// Group files whose normalized names collide (keeps only real duplicate sets).
function clusterByName(files) {
  const map = new Map()
  for (const f of files) {
    const k = normalizeName(f.name)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(f)
  }
  return [...map.values()].filter((c) => c.length > 1)
}

function popcountHex(hex) {
  let c = 0
  for (let i = 0; i < hex.length; i++) {
    let x = parseInt(hex[i], 16)
    while (x) {
      c += x & 1
      x >>= 1
    }
  }
  return c
}

// A near-uniform image (mostly one color — solid black/white backgrounds, etc.)
// produces a fingerprint that's almost all 0s or all 1s. Those aren't reliable
// to match on, so we exclude them to avoid grouping unrelated flat images.
function isDegenerateHash(hex) {
  const bits = hex.length * 4
  const p = popcountHex(hex)
  return p < 8 || p > bits - 8
}

// Group files whose visual fingerprints are within `threshold` bits (union-find
// over the distinct hashes, so transitively-similar images end up together).
// Tight threshold + degenerate-hash exclusion keeps it to genuine duplicates.
function clusterByHash(files, hashes, threshold = 3) {
  const byHex = new Map()
  for (const f of files) {
    const h = hashes[f.path]
    if (!h || isDegenerateHash(h)) continue
    if (!byHex.has(h)) byHex.set(h, [])
    byHex.get(h).push(f)
  }
  const hexes = [...byHex.keys()]
  const parent = new Map(hexes.map((h) => [h, h]))
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      if (hamming(hexes[i], hexes[j]) <= threshold) parent.set(find(hexes[i]), find(hexes[j]))
    }
  }
  const clusters = new Map()
  for (const h of hexes) {
    const r = find(h)
    if (!clusters.has(r)) clusters.set(r, [])
    clusters.get(r).push(...byHex.get(h))
  }
  return [...clusters.values()].filter((c) => c.length > 1).sort((a, b) => b.length - a.length)
}

// Crisp trashcan icon (inherits button color via currentColor).
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

// Memoized row — only re-renders when its own selected/picked state changes,
// so arrow-stepping through thousands of results stays instant.
const ResultRow = memo(function ResultRow({ f, selected, isPicked, onSelect, onMenu, onToggle, onOpen, onTrash }) {
  return (
    <div
      className={`result-row ${selected ? 'sel' : ''}`}
      onClick={() => onSelect(f.path)}
      onContextMenu={(e) => onMenu(e, f.path)}
    >
      <input
        type="checkbox"
        checked={isPicked}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(f.path)}
      />
      <span className="result-thumb">
        {isImage(f.ext) ? (
          <img src={thumbUrl(f.path, 96)} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="result-ico">{iconFor(f.ext)}</span>
        )}
      </span>
      <span className="result-name">{f.name}</span>
      <span className="result-meta">
        {human(f.size)} · {fmtDate(f.modified)}
      </span>
      <button
        className="result-open"
        title="Open file location"
        onClick={(e) => {
          e.stopPropagation()
          onOpen(f.path)
        }}
      >
        📂
      </button>
      <button
        className="result-open result-trash"
        title="Delete (to Recycle Bin)"
        onClick={(e) => {
          e.stopPropagation()
          onTrash(f)
        }}
      >
        🗑
      </button>
    </div>
  )
})

const ThumbTile = memo(function ThumbTile({ f, selected, isPicked, onSelect, onMenu, onToggle, onTrash }) {
  return (
    <div
      className={`scan-tile ${selected ? 'sel' : ''}`}
      onClick={() => onSelect(f.path)}
      onContextMenu={(e) => onMenu(e, f.path)}
      title={f.name}
    >
      <div className="scan-tile-thumb">
        {isImage(f.ext) ? (
          <img src={thumbUrl(f.path, 320)} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="result-ico">{iconFor(f.ext)}</span>
        )}
      </div>
      <input
        type="checkbox"
        className="scan-tile-check"
        checked={isPicked}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggle(f.path)}
      />
      <button
        className="scan-tile-trash"
        title="Delete now"
        onClick={(e) => {
          e.stopPropagation()
          onTrash(f)
        }}
      >
        <TrashIcon />
      </button>
      <div className="scan-tile-name">{f.name}</div>
    </div>
  )
})

export default function ScanImport({
  area,
  areaLabel = 'library',
  title,
  defaultCategories = [],
  prefix = '',
  onClose,
  onDone
}) {
  const [dest, setDest] = useState(prefix)
  const [mode, setMode] = useState('copy') // 'copy' | 'move'
  const [roots, setRoots] = useState([])
  const [exts, setExts] = useState(() => {
    const s = new Set()
    defaultCategories.forEach((c) => CATEGORIES[c]?.forEach((e) => s.add(e)))
    return s
  })
  const [scanning, setScanning] = useState(false)
  const [scanCount, setScanCount] = useState(0) // files found so far during a scan
  const [deletedCount, setDeletedCount] = useState(0) // files sent to Recycle Bin this session
  const [results, setResults] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [progress, setProgress] = useState(null) // { done, total }
  const [libReady, setLibReady] = useState(false)
  const [openCat, setOpenCat] = useState(null) // which category's extensions are expanded
  const [quickFolders, setQuickFolders] = useState([])
  const [extQuery, setExtQuery] = useState({}) // per-category extension search
  const [sel, setSel] = useState(null) // path of file being previewed
  const [groups, setGroups] = useState(() => getGroups(area))
  const [phase, setPhase] = useState('setup') // 'setup' | 'results'
  const [step, setStep] = useState(1) // setup wizard step: 1 = location, 2 = types
  // Images default to the gallery (thumbnail) view; everything else to the list.
  const [view, setView] = useState(() => (defaultCategories.includes('Image') ? 'thumb' : 'list'))
  const [dupMode, setDupMode] = useState('off') // 'off' | 'name' | 'image'
  const [hashes, setHashes] = useState({}) // path -> perceptual hash
  const [hashing, setHashing] = useState(null) // { done, total } while fingerprinting
  const [dupSetIndex, setDupSetIndex] = useState(0) // which duplicate set is under review
  const [keepPath, setKeepPath] = useState(null) // the copy chosen to keep in this set
  const [resultQuery, setResultQuery] = useState('')
  const [rowMenu, setRowMenu] = useState(null) // { x, y, path }
  const rowMenuRef = useRef(null)
  const [error, setError] = useState('')

  function destBase() {
    let base = dest.trim().replace(/^\/+/, '')
    if (base && !base.endsWith('/')) base += '/'
    return base
  }

  async function createGroup() {
    const n = safeName(await showPrompt({ message: 'Name your group', placeholder: 'e.g. Vacation' }))
    if (!n) return
    await window.api.library.createGroup(area, n)
    setGroups(addGroup(area, n))
    setDest(`${n}/`)
  }

  // Copy = add to storage, keep original. Once added, drop it from the results
  // so it won't show up again while browsing/searching.
  async function copyOne(f) {
    if (!libReady) return setError('Set up where this library lives first.')
    try {
      await window.api.library.import(area, destBase(), f.path)
      dropFromResults(f.path)
      onDone?.(1)
    } catch (e) {
      setError(`Couldn’t add ${f.name}: ${e.message}`)
    }
  }

  function dropFromResults(path) {
    setResults((prev) => prev.filter((x) => x.path !== path))
    setPicked((prev) => {
      const n = new Set(prev)
      n.delete(path)
      return n
    })
    if (sel === path) setSel(null)
  }

  // Single-item delete — no confirm (it goes to the Recycle Bin, so it's recoverable).
  async function trashOne(f) {
    try {
      await window.api.trashFile(f.path)
      dropFromResults(f.path)
      setDeletedCount((c) => c + 1)
    } catch (e) {
      setError(`Couldn’t delete ${f.name}: ${e.message}`)
    }
  }

  // Delete every duplicate except the newest copy in each set (to Recycle Bin).
  async function deleteAllButNewest() {
    const extras = dupExtras
    if (!extras.length) return
    if (
      !window.confirm(
        `Delete ${extras.length} older duplicate${extras.length === 1 ? '' : 's'}? ` +
          `The newest copy in each set is kept. Deleted files go to the Recycle Bin.`
      )
    )
      return
    const gone = new Set()
    for (const f of extras) {
      try {
        await window.api.trashFile(f.path)
        gone.add(f.path)
      } catch {
        /* skip files that can't be trashed */
      }
    }
    setResults((prev) => prev.filter((x) => !gone.has(x.path)))
    setPicked((prev) => {
      const n = new Set(prev)
      gone.forEach((p) => n.delete(p))
      return n
    })
    if (sel && gone.has(sel)) setSel(null)
    setDeletedCount((c) => c + gone.size)
    onDone?.()
  }

  // Delete every copy in one set except the chosen keeper (used in set-by-set
  // review). No prompt — the review itself is the deliberate confirmation.
  async function deleteSetExcept(cluster, keep) {
    const toDelete = cluster.filter((f) => f.path !== keep)
    if (!toDelete.length) return
    const gone = new Set()
    for (const f of toDelete) {
      try {
        await window.api.trashFile(f.path)
        gone.add(f.path)
      } catch {
        /* skip */
      }
    }
    setResults((prev) => prev.filter((x) => !gone.has(x.path)))
    setPicked((prev) => {
      const n = new Set(prev)
      gone.forEach((p) => n.delete(p))
      return n
    })
    setKeepPath(null)
    setDeletedCount((c) => c + gone.size)
    onDone?.()
  }

  // Copy = save to storage, keep original. Move = save then trash original.
  async function moveOne(f) {
    if (!libReady) return setError('Set up where this library lives first.')
    try {
      await window.api.library.import(area, destBase(), f.path)
      await window.api.trashFile(f.path)
      dropFromResults(f.path)
      onDone?.(1)
    } catch (e) {
      setError(`Couldn’t move ${f.name}: ${e.message}`)
    }
  }

  // Copy or move the given files into a group base (base '' = top level).
  async function importInto(targets, base, doMove) {
    if (!libReady) return setError('Set up where this library lives first.')
    if (!targets.length) return
    for (const t of targets) {
      try {
        await window.api.library.import(area, base, t.path)
        if (doMove) await window.api.trashFile(t.path)
        dropFromResults(t.path)
      } catch (e) {
        setError(`Failed on ${t.name}: ${e.message}`)
        break
      }
    }
    setPicked(new Set())
    onDone?.(targets.length)
  }

  // Handle the "Copy/Move into…" dropdown (executes on selecting a group).
  async function pickDestination(targets, value) {
    if (!value) return
    const doMove = mode === 'move'
    if (value === '__new') {
      const name = safeName(await showPrompt({ message: 'New group name', placeholder: 'e.g. Vacation' }))
      if (!name) return
      await window.api.library.createGroup(area, name).catch(() => {})
      setGroups(addGroup(area, name))
      await importInto(targets, `${name}/`, doMove)
    } else {
      await importInto(targets, value === '__top' ? '' : `${value}/`, doMove)
    }
  }
  async function deleteTargets(targets) {
    if (!targets.length) return
    const n = targets.length
    if (!window.confirm(`Move ${n} file${n === 1 ? '' : 's'} to the Recycle Bin?`)) return
    for (const t of targets) {
      try {
        await window.api.trashFile(t.path)
      } catch {
        /* skip */
      }
    }
    targets.forEach((t) => dropFromResults(t.path))
    setPicked(new Set())
  }

  // Close the row context menu on outside click / Escape (capture phase, since
  // the modal stops propagation).
  useEffect(() => {
    if (!rowMenu) return
    const close = (e) => {
      if (!rowMenuRef.current?.contains(e.target)) setRowMenu(null)
    }
    const onKey = (e) => e.key === 'Escape' && setRowMenu(null)
    document.addEventListener('mousedown', close, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [rowMenu])

  function refreshLib() {
    window.api?.library?.getConfig(area).then((c) => setLibReady(!!c))
  }
  useEffect(() => {
    refreshLib()
    window.api?.commonFolders?.().then((f) => setQuickFolders(f || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area])

  function addRoot(path) {
    setRoots((prev) => [...new Set([...prev, path])])
  }

  function toggleExt(e) {
    setExts((prev) => {
      const next = new Set(prev)
      next.has(e) ? next.delete(e) : next.add(e)
      return next
    })
  }

  function toggleCategory(cat, on) {
    setExts((prev) => {
      const next = new Set(prev)
      CATEGORIES[cat].forEach((e) => (on ? next.add(e) : next.delete(e)))
      return next
    })
  }

  async function addFolders() {
    const picks = await window.api.pickFolders()
    if (picks?.length) setRoots((prev) => [...new Set([...prev, ...picks])])
  }

  async function scan() {
    setError('')
    if (!roots.length) return setError('Add at least one folder to scan.')
    if (!exts.size) return setError('Pick at least one file type.')
    setScanning(true)
    setScanCount(0)
    setDeletedCount(0)
    setResults([])
    const off = window.api.onScanProgress?.((n) => setScanCount(n))
    try {
      const res = await window.api.scan(roots, [...exts])
      setResults(res.files)
      setTruncated(res.truncated)
      setPicked(new Set()) // nothing checked by default
      setSel(res.files[0]?.path || null)
      if (res.files.length) setPhase('results')
      else setError('No matching files found in those folders.')
    } catch (e) {
      setError(e?.message || 'Scan failed.')
    } finally {
      off?.()
      setScanning(false)
    }
  }

  function togglePick(path) {
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  // Stable handlers for the memoized rows/tiles (identity never changes, so a
  // selection change only re-renders the two rows whose `selected` flipped).
  const rowFns = useRef({})
  rowFns.current = { togglePick, trashOne }
  const onRowSelect = useCallback((p) => setSel(p), [])
  const onRowToggle = useCallback((p) => rowFns.current.togglePick(p), [])
  const onRowTrash = useCallback((f) => rowFns.current.trashOne(f), [])
  const onRowOpen = useCallback((p) => window.api.showInFolder(p), [])
  const onRowMenu = useCallback((e, p) => {
    e.preventDefault()
    setRowMenu({ x: e.clientX, y: e.clientY, path: p })
  }, [])

  const allPicked = results.length > 0 && picked.size === results.length
  function toggleAll() {
    setPicked(allPicked ? new Set() : new Set(results.map((f) => f.path)))
  }

  // Duplicate clusters for the current search subset (null when the switch is off).
  const dupClusters = useMemo(() => {
    if (dupMode === 'off') return null
    const q = resultQuery.trim().toLowerCase()
    const base = q ? results.filter((f) => f.name.toLowerCase().includes(q)) : results
    return dupMode === 'name' ? clusterByName(base) : clusterByHash(base, hashes)
  }, [dupMode, results, resultQuery, hashes])

  // The older copies in each duplicate set — everything except the newest file.
  const dupExtras = useMemo(() => {
    if (!dupClusters) return []
    return dupClusters.flatMap((c) =>
      [...c].sort((a, b) => (b.modified || 0) - (a.modified || 0)).slice(1)
    )
  }, [dupClusters])

  // True while the "by image" fingerprint pass is still running — results and
  // the delete action stay hidden until it's fully done, so nothing is acted on
  // (or shown) based on a partial, inaccurate analysis.
  const dupBusy = dupMode === 'image' && !!hashing

  // Switching duplicate modes restarts the set-by-set review at the first set.
  useEffect(() => {
    setDupSetIndex(0)
    setKeepPath(null)
  }, [dupMode])

  // The list actually shown: search results, or — with the dup switch on — only
  // the files that belong to a duplicate set, grouped so copies sit together.
  const visibleResults = useMemo(() => {
    if (dupClusters) return dupClusters.flat()
    const q = resultQuery.trim().toLowerCase()
    return q ? results.filter((f) => f.name.toLowerCase().includes(q)) : results
  }, [results, resultQuery, dupClusters])

  // When "by image" is on, fingerprint every image once (cached on disk), with
  // progress. Hashes accumulate into state so clusters form as it goes.
  useEffect(() => {
    if (dupMode !== 'image' || phase !== 'results') return
    const todo = results.filter((f) => isImage(f.ext) && !hashes[f.path])
    if (!todo.length) {
      setHashing(null)
      return
    }
    let cancelled = false
    setHashing({ done: 0, total: todo.length })
    ;(async () => {
      const acc = {}
      for (let i = 0; i < todo.length; i++) {
        if (cancelled) return
        const h = await window.api.imageHash(todo[i].path)
        if (h) acc[todo[i].path] = h
        if (i % 20 === 0 || i === todo.length - 1) {
          setHashes((prev) => ({ ...prev, ...acc }))
          setHashing({ done: i + 1, total: todo.length })
        }
      }
      if (!cancelled) setHashing(null)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupMode, phase, results])

  // Keep the latest results/selection in a ref so the key handler (attached once)
  // never reads stale values — this is what makes arrow-stepping reliable.
  const navRef = useRef({ visibleResults, sel })
  navRef.current = { visibleResults, sel }

  // Step the highlighted file by delta (used by the on-screen arrows and keys).
  function moveSel(delta) {
    const { visibleResults: vr, sel: cur } = navRef.current
    if (!vr.length) return
    const idx = vr.findIndex((f) => f.path === cur)
    const ni = Math.max(0, Math.min(vr.length - 1, (idx < 0 ? 0 : idx) + delta))
    setSel(vr[ni]?.path ?? cur)
  }

  // How many columns the thumbnail grid is currently showing (1 in list view).
  function gridColumns() {
    const grid = document.querySelector('.results-scroll.thumbs')
    if (!grid) return 1
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length
    return Math.max(1, cols)
  }

  // Arrow-key handler for the results view. Bound as onKeyDown on the focused
  // modal container so it fires regardless of window-level focus quirks.
  // Left/Right step one item; Up/Down jump a full row in the grid.
  function onResultsKey(e) {
    if (phase !== 'results') return
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    const ae = document.activeElement
    if (
      ae &&
      (ae.tagName === 'TEXTAREA' ||
        ae.tagName === 'SELECT' ||
        (ae.tagName === 'INPUT' && !['checkbox', 'radio'].includes(ae.type)))
    )
      return
    e.preventDefault()
    // In duplicate review, arrows step between sets (not individual files).
    if (dupMode !== 'off' && !dupBusy && dupClusters && dupClusters.length) {
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      setDupSetIndex((i) => Math.max(0, Math.min(dupClusters.length - 1, i + (back ? -1 : 1))))
      setKeepPath(null)
      return
    }
    const cols = view === 'thumb' ? gridColumns() : 1
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    moveSel(delta)
  }

  // Focus the results container so arrow keys land, once results are shown.
  const resultsRef = useRef(null)
  useEffect(() => {
    if (phase === 'results') resultsRef.current?.focus()
  }, [phase])


  // Warm the cache for the neighbours of the current image so flipping is
  // instant (the next/previous previews are already fetched + decoded).
  useEffect(() => {
    if (phase !== 'results' || !sel) return
    const idx = visibleResults.findIndex((f) => f.path === sel)
    if (idx < 0) return
    const warm = []
    for (let d = -2; d <= 2; d++) {
      const f = visibleResults[idx + d]
      if (f && d !== 0 && isImage(f.ext)) warm.push(f.path)
    }
    const imgs = warm.map((p) => {
      const im = new Image()
      im.src = thumbUrl(p, 1280)
      return im
    })
    return () => imgs.forEach((im) => (im.src = ''))
  }, [sel, phase, visibleResults])

  // Keep the selected item scrolled into view — list row OR grid tile.
  useEffect(() => {
    if (sel) document.querySelector('.result-row.sel, .scan-tile.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  async function deleteSelected() {
    const files = results.filter((f) => picked.has(f.path))
    if (!files.length) return
    if (!window.confirm(`Move ${files.length} file${files.length === 1 ? '' : 's'} to the Recycle Bin?`))
      return
    for (const f of files) {
      try {
        await window.api.trashFile(f.path)
      } catch {
        /* skip failures */
      }
    }
    setResults((prev) => prev.filter((f) => !picked.has(f.path)))
    setPicked(new Set())
    setSel(null)
  }

  async function importPicked() {
    const files = results.filter((f) => picked.has(f.path))
    if (!files.length) return
    if (!libReady) return setError('Set up where this library lives first.')
    setError('')
    const base = destBase()
    setProgress({ done: 0, total: files.length })
    let done = 0
    const importedPaths = []
    for (const f of files) {
      try {
        await window.api.library.import(area, base, f.path, MIME[f.ext] || 'application/octet-stream')
        importedPaths.push(f.path)
      } catch (e) {
        setError(`Failed on ${f.name}: ${e.message}`)
        break
      }
      done++
      setProgress({ done, total: files.length })
    }
    setProgress(null)
    // Added files leave the results list so they won't reappear.
    const importedSet = new Set(importedPaths)
    setResults((prev) => prev.filter((f) => !importedSet.has(f.path)))
    setPicked(new Set())
    if (sel && importedSet.has(sel)) setSel(null)
    onDone?.(done)
  }

  const totalSize = useMemo(
    () => results.filter((f) => picked.has(f.path)).reduce((s, f) => s + (f.size || 0), 0),
    [results, picked]
  )

  // Only show the categories relevant to this area.
  const shownCategories = Object.entries(CATEGORIES).filter(([cat]) =>
    defaultCategories.includes(cat)
  )

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={resultsRef}
        tabIndex={-1}
        onKeyDown={onResultsKey}
        style={{ outline: 'none' }}
        className={`modal modal-wide ${libReady && phase === 'results' ? 'modal-results' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {!libReady ? (
          /* Must choose a location before anything else. */
          <LibrarySetup area={area} label={areaLabel} onReady={refreshLib} />
        ) : scanning ? (
          <div className="scan-loading">
            <div className="scan-loading-icon">🔎</div>
            <div className="scan-loading-title">
              Searching {defaultCategories[0] === 'Image' ? 'images' : 'files'}…
            </div>
            <div className="scan-loading-count">{scanCount.toLocaleString()} found</div>
            <div className="scan-loading-bar">
              <div className="scan-loading-bar-fill" />
            </div>
            <div className="scan-loading-sub">Looking through your folders — hang tight.</div>
          </div>
        ) : phase === 'setup' ? (
          <>
            {/* Step 1 — where to scan */}
            <div className="scan-step">
              <div className="scan-step-head">
                <span className="step-num">1</span>
                <span className="step-title">Where to look</span>
              </div>
              <div className="quick-folders">
                {quickFolders.map((f) => (
                  <button
                    key={f.path}
                    className={`quick-folder ${roots.includes(f.path) ? 'on' : ''}`}
                    onClick={() => addRoot(f.path)}
                  >
                    {f.label}
                  </button>
                ))}
                <button className="quick-folder browse" onClick={addFolders}>
                  Browse…
                </button>
              </div>
              {roots.length > 0 && (
                <div className="scan-roots">
                  {roots.map((r) => (
                    <span key={r} className="root-chip" title={r}>
                      📁 {shortPath(r)}
                      <button onClick={() => setRoots((p) => p.filter((x) => x !== r))}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {step === 1 && (
                <button
                  className="btn-primary scan-continue"
                  disabled={roots.length === 0}
                  onClick={() => setStep(2)}
                >
                  Continue →
                </button>
              )}
            </div>

            {/* Step 2 — what to find (revealed after the user continues from step 1) */}
            {step >= 2 && (
            <div className="scan-step">
              <div className="scan-step-head">
                <span className="step-num">2</span>
                <span className="step-title">What to find</span>
              </div>
              <div className="cat-grid">
                {shownCategories.map(([cat, list]) => {
                  const on = list.every((e) => exts.has(e))
                  const some = !on && list.some((e) => exts.has(e))
                  const meta = CATEGORY_META[cat] || {}
                  const openThis = openCat === cat
                  const q = (extQuery[cat] || '').toLowerCase().replace(/^\./, '')
                  const filtered = q ? list.filter((e) => e.includes(q)) : list
                  return (
                    <div
                      key={cat}
                      className={`cat-card ${on ? 'on' : some ? 'some' : ''} ${openThis ? 'expanded' : ''}`}
                    >
                      <div className="cat-row">
                        <button className="cat-main" onClick={() => toggleCategory(cat, !on)}>
                          <span className="cat-check">{on ? '✓' : some ? '–' : ''}</span>
                          <span className="cat-icon">{meta.icon}</span>
                          <span className="cat-text">
                            <span className="cat-name">{cat}</span>
                            <span className="cat-blurb">{meta.blurb}</span>
                          </span>
                        </button>
                        <button
                          className="cat-expand"
                          title="Choose specific types"
                          onClick={() => {
                            if (openThis) {
                              setOpenCat(null)
                            } else {
                              // Opening to pick specific types — start with none
                              // of this category's extensions selected.
                              setOpenCat(cat)
                              setExts((prev) => {
                                const next = new Set(prev)
                                list.forEach((e) => next.delete(e))
                                return next
                              })
                            }
                          }}
                        >
                          {openThis ? '▴' : '▾'}
                        </button>
                      </div>

                      {openThis && (
                        <div className="cat-exts">
                          <input
                            className="ext-search"
                            placeholder={`Search ${cat.toLowerCase()} types…`}
                            value={extQuery[cat] || ''}
                            onChange={(e) => setExtQuery((p) => ({ ...p, [cat]: e.target.value }))}
                          />
                          <div className="type-exts">
                            {filtered.map((e) => (
                              <label key={e} className={`ext-chip ${exts.has(e) ? 'on' : ''}`}>
                                <input type="checkbox" checked={exts.has(e)} onChange={() => toggleExt(e)} />
                                {e}
                              </label>
                            ))}
                            {filtered.length === 0 && <span className="ext-none">No match</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )}

            {error && <div className="status err">{error}</div>}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>
                Close
              </button>
              <button
                className="btn-primary scan-go"
                onClick={scan}
                disabled={scanning || !roots.length || !exts.size}
              >
                {scanning ? 'Scanning…' : '🔎 Scan'}
              </button>
            </div>
          </>
        ) : (
          /* Phase 2 — results window */
          <>
            <div className="results-bar">
              <span className="results-summary">
                {dupMode !== 'off'
                  ? `${dupClusters ? dupClusters.length : 0} duplicate set${dupClusters && dupClusters.length === 1 ? '' : 's'} · ${visibleResults.length} file${visibleResults.length === 1 ? '' : 's'}`
                  : `${results.length} file${results.length === 1 ? '' : 's'} found${truncated ? ' — capped at 20,000; narrow the folders/types or search for the rest' : ''}`}
                {hashing ? ` · fingerprinting ${hashing.done}/${hashing.total}…` : ''}
              </span>
              {deletedCount > 0 && (
                <span className="deleted-count">
                  <TrashIcon /> {deletedCount} deleted
                </span>
              )}
              <div className="dup-switch">
                <span className="dup-label">Find duplicates</span>
                <button className={dupMode === 'off' ? 'on' : ''} onClick={() => setDupMode('off')}>
                  Off
                </button>
                <button className={dupMode === 'name' ? 'on' : ''} onClick={() => setDupMode('name')}>
                  By name
                </button>
                <button className={dupMode === 'image' ? 'on' : ''} onClick={() => setDupMode('image')}>
                  By image
                </button>
              </div>
              {dupMode !== 'off' && !dupBusy && dupExtras.length > 0 && (
                <button className="dup-clean" onClick={deleteAllButNewest}>
                  🗑 Delete all but newest ({dupExtras.length})
                </button>
              )}
              <button className="link-btn" onClick={() => { setPhase('setup'); setStep(1) }}>
                ← New scan
              </button>
            </div>

            {error && <div className="status err">{error}</div>}

            {(() => {
              const list = visibleResults
              const current = results.find((f) => f.path === sel)
              const allVis = list.length > 0 && list.every((f) => picked.has(f.path))
              const toggleAllVis = () =>
                setPicked((prev) => {
                  const n = new Set(prev)
                  list.forEach((f) => (allVis ? n.delete(f.path) : n.add(f.path)))
                  return n
                })
              // While fingerprinting, the progress fills the whole results box.
              if (dupBusy) {
                return (
                  <div className="results big results-analyzing">
                    <div className="dup-progress">
                      <div className="dup-spinner" />
                      <div className="dup-progress-text">
                        Fingerprinting images… {hashing.done} / {hashing.total}
                      </div>
                      <div className="dup-progress-sub">
                        Duplicates appear once every image has been analyzed — so nothing is matched
                        or deleted on a partial scan.
                      </div>
                      <div className="dup-bar">
                        <div
                          className="dup-bar-fill"
                          style={{ width: `${Math.round((hashing.done / hashing.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              }

              // Duplicate review — one set at a time so similar copies can be
              // compared carefully before anything is deleted.
              if (dupClusters) {
                if (!dupClusters.length) {
                  return (
                    <div className="results big">
                      <div className="results-empty">No duplicates found.</div>
                    </div>
                  )
                }
                const idx = Math.min(dupSetIndex, dupClusters.length - 1)
                const set = [...dupClusters[idx]].sort((a, b) => (b.modified || 0) - (a.modified || 0))
                const newestPath = set[0].path
                const keeper = keepPath && set.some((f) => f.path === keepPath) ? keepPath : newestPath
                const go = (delta) => {
                  setDupSetIndex((i) => Math.max(0, Math.min(dupClusters.length - 1, i + delta)))
                  setKeepPath(null)
                }
                return (
                  <div className="results big dup-review">
                    <div className="dup-review-head">
                      <button className="nav-arrow" onClick={() => go(-1)} disabled={idx === 0}>
                        ◀
                      </button>
                      <span className="dup-review-title">
                        Duplicate set {idx + 1} of {dupClusters.length} · {set.length} copies
                      </span>
                      <button
                        className="nav-arrow"
                        onClick={() => go(1)}
                        disabled={idx === dupClusters.length - 1}
                      >
                        ▶
                      </button>
                    </div>
                    <div className="dup-review-hint">
                      Click the copy you want to <b>keep</b> (newest is pre-selected). The rest will
                      go to the Recycle Bin.
                    </div>
                    <div className="dup-review-cards">
                      {set.map((f) => (
                        <div
                          key={f.path}
                          className={`dup-card ${keeper === f.path ? 'keep' : 'del'}`}
                          onClick={() => setKeepPath(f.path)}
                        >
                          <button
                            className="dup-card-trash"
                            title="Delete this file now"
                            onClick={(e) => {
                              e.stopPropagation()
                              trashOne(f)
                            }}
                          >
                            <TrashIcon />
                          </button>
                          <div className="dup-card-thumb">
                            {isImage(f.ext) ? (
                              <img src={thumbUrl(f.path, 320)} alt="" loading="lazy" />
                            ) : (
                              <span className="result-ico">{iconFor(f.ext)}</span>
                            )}
                          </div>
                          <div className="dup-card-badge">{keeper === f.path ? '✓ Keep' : '🗑 Delete'}</div>
                          <div className="dup-card-name" title={f.path}>
                            {f.name}
                          </div>
                          <div className="dup-card-meta">
                            {human(f.size)} · {fmtDate(f.modified)}
                            {f.path === newestPath ? ' · newest' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="dup-review-actions">
                      <button
                        className="btn-ghost"
                        onClick={() => go(1)}
                        disabled={idx === dupClusters.length - 1}
                      >
                        Not duplicates — skip →
                      </button>
                      <button
                        className="dup-clean"
                        onClick={() => deleteSetExcept(dupClusters[idx], keeper)}
                      >
                        🗑 Delete other {set.length - 1}, keep selected
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div className="results big">
                    <div className="results-list">
                      <div className="results-head">
                        <label className="results-selall">
                          <input type="checkbox" checked={allVis} onChange={toggleAllVis} /> Select all
                          {picked.size ? ` (${picked.size})` : ''}
                        </label>
                        <div className="results-head-right">
                          <input
                            className="results-search"
                            placeholder="Search results…"
                            value={resultQuery}
                            onChange={(e) => setResultQuery(e.target.value)}
                          />
                          <div className="view-toggle">
                            <button
                              className={view === 'thumb' ? 'on' : ''}
                              title="Gallery view"
                              onClick={() => setView('thumb')}
                            >
                              ▦
                            </button>
                            <button
                              className={view === 'list' ? 'on' : ''}
                              title="List view"
                              onClick={() => setView('list')}
                            >
                              ☰
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className={`results-scroll ${view === 'thumb' ? 'thumbs' : ''}`}>
                        {view === 'list' &&
                          list.map((f) => (
                            <ResultRow
                              key={f.path}
                              f={f}
                              selected={sel === f.path}
                              isPicked={picked.has(f.path)}
                              onSelect={onRowSelect}
                              onMenu={onRowMenu}
                              onToggle={onRowToggle}
                              onOpen={onRowOpen}
                              onTrash={onRowTrash}
                            />
                          ))}

                        {view === 'thumb' &&
                          list.map((f) => (
                            <ThumbTile
                              key={f.path}
                              f={f}
                              selected={sel === f.path}
                              isPicked={picked.has(f.path)}
                              onSelect={onRowSelect}
                              onMenu={onRowMenu}
                              onToggle={onRowToggle}
                              onTrash={onRowTrash}
                            />
                          ))}

                        {list.length === 0 && (
                          <div className="results-empty">
                            {dupMode !== 'off'
                              ? 'No duplicates found.'
                              : `No results match “${resultQuery}”.`}
                          </div>
                        )}
                      </div>
                    </div>

                    {(() => {
                      const targets = picked.size
                        ? results.filter((f) => picked.has(f.path))
                        : current
                          ? [current]
                          : []
                      const n = targets.length
                      const sfx = n > 1 ? ` ${n}` : ''
                      const groupLabel = dest ? dest.replace(/\/$/, '') : 'Top level'
                      return (
                        <div className="results-preview">
                          {picked.size > 0 ? (
                            <div className="sel-summary">
                              <div className="sel-check">✓</div>
                              <div className="sel-count">
                                {picked.size} file{picked.size > 1 ? 's' : ''} selected
                              </div>
                            </div>
                          ) : current ? (
                            <>
                              <div className="preview-nav">
                                <button
                                  className="nav-arrow"
                                  title="Previous (←)"
                                  onClick={() => moveSel(-1)}
                                >
                                  ◀
                                </button>
                                <span className="nav-count">
                                  {visibleResults.findIndex((f) => f.path === current.path) + 1} of{' '}
                                  {visibleResults.length}
                                </span>
                                <button
                                  className="nav-arrow"
                                  title="Next (→)"
                                  onClick={() => moveSel(1)}
                                >
                                  ▶
                                </button>
                              </div>
                              <div className="preview-media">
                                {isImage(current.ext) ? (
                                  <img src={thumbUrl(current.path, 1280)} alt={current.name} />
                                ) : (
                                  <div className="preview-ico">{iconFor(current.ext)}</div>
                                )}
                              </div>
                              <div className="preview-name">{current.name}</div>
                              <div className="preview-meta">
                                {current.ext.toUpperCase()} · {human(current.size)}
                              </div>
                              <div className="preview-path" title={current.path}>
                                {current.path}
                              </div>
                            </>
                          ) : (
                            <div className="preview-empty">
                              Click a file to preview, or check files to act on them.
                            </div>
                          )}

                          {picked.size > 0 && (
                            <div className="act">
                              <div className="mode-radios">
                                <label className="mode-radio">
                                  <input
                                    type="radio"
                                    name="scan-mode"
                                    checked={mode === 'copy'}
                                    onChange={() => setMode('copy')}
                                  />
                                  Copy
                                </label>
                                <label className="mode-radio">
                                  <input
                                    type="radio"
                                    name="scan-mode"
                                    checked={mode === 'move'}
                                    onChange={() => setMode('move')}
                                  />
                                  Move
                                </label>
                                <label className="mode-radio">
                                  <input
                                    type="radio"
                                    name="scan-mode"
                                    checked={mode === 'delete'}
                                    onChange={() => setMode('delete')}
                                  />
                                  Delete
                                </label>
                              </div>

                              {mode === 'delete' ? (
                                <button
                                  className="danger-btn act-into"
                                  onClick={() => deleteTargets(targets)}
                                >
                                  🗑 Delete {n}
                                </button>
                              ) : (
                                <select
                                  className="dest-select act-into"
                                  value=""
                                  onChange={(e) => {
                                    const v = e.target.value
                                    e.target.value = ''
                                    pickDestination(targets, v)
                                  }}
                                >
                                  <option value="">Choose a group…</option>
                                  {groups.map((g) => (
                                    <option key={g} value={g}>
                                      {g}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}

            {rowMenu &&
              (() => {
                const f = results.find((r) => r.path === rowMenu.path)
                if (!f) return null
                return (
                  <div
                    ref={rowMenuRef}
                    className="context-menu"
                    style={{ top: rowMenu.y, left: rowMenu.x }}
                  >
                    <button
                      className="context-item"
                      onClick={() => {
                        window.api.showInFolder(f.path)
                        setRowMenu(null)
                      }}
                    >
                      📂 Open file location
                    </button>
                    <div className="context-divider" />
                    <button
                      className="context-item"
                      onClick={() => {
                        copyOne(f)
                        setRowMenu(null)
                      }}
                    >
                      ⧉ Copy to storage
                    </button>
                    <button
                      className="context-item"
                      onClick={() => {
                        moveOne(f)
                        setRowMenu(null)
                      }}
                    >
                      ➜ Move to storage
                    </button>
                    <div className="context-divider" />
                    <button
                      className="context-item danger"
                      onClick={() => {
                        trashOne(f)
                        setRowMenu(null)
                      }}
                    >
                      🗑 Delete original
                    </button>
                  </div>
                )
              })()}

          </>
        )}
      </div>
    </div>
  )
}
