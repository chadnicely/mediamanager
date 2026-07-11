import { app, shell, BrowserWindow, ipcMain, dialog, desktopCapturer, screen, protocol, nativeImage, globalShortcut, clipboard, Notification } from 'electron'
import { join, extname, basename, normalize } from 'path'
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises'
import { createHash } from 'crypto'
import { spawn } from 'child_process'
import net from 'net'
import * as storage from './storage.js'
import { startReceiver } from './receiver.js'

// The login/accounts API lives in server/ and normally has to be started by
// hand in a second terminal. In dev we launch it automatically so opening
// Sniddy is all it takes. Packaged builds skip this and talk to the hosted API.
let authServerProc = null

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1')
    sock.setTimeout(500)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error', () => resolve(false))
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
  })
}

async function startAuthServer() {
  if (app.isPackaged) return // distributed builds use the hosted API, not a local server
  const port = Number(process.env.JOTTER_API_PORT) || 4500
  if (await portInUse(port)) {
    console.log(`[auth] server already running on :${port}`)
    return
  }
  const serverDir = join(__dirname, '../../server')
  authServerProc = spawn(process.execPath, [join(serverDir, 'index.js')], {
    cwd: serverDir,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit'
  })
  authServerProc.on('exit', (code) => {
    console.log(`[auth] server exited (${code})`)
    authServerProc = null
  })
  console.log('[auth] starting local auth server…')
}

let mainWindow = null

// Custom scheme so the renderer can load local image files (for local libraries).
// Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'jotter-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true
    }
  }
])

const MEDIA_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
  svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime'
}
function mimeFromPath(p) {
  return MEDIA_MIME[extname(p).slice(1).toLowerCase()] || 'application/octet-stream'
}

const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|tiff?|ico)$/i

// List a single folder (non-recursive), FastStone-style: subfolders to navigate
// into + the image files inside. Absolute paths so the renderer can build
// jotter-media thumbnail URLs directly (no import needed).
async function listFolder(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { dir, folders: [], items: [] }
  }
  const folders = []
  const items = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
      folders.push({ name: entry.name, path: full })
    } else if (entry.isFile() && IMG_EXT.test(entry.name)) {
      let size = 0
      let modified = 0
      try {
        const s = await stat(full)
        size = s.size
        modified = s.mtimeMs
      } catch {
        /* ignore */
      }
      items.push({ name: entry.name, path: full, size, modified })
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name))
  items.sort((a, b) => a.name.localeCompare(b.name))
  return { dir, folders, items }
}

// ---- Thumbnail cache -------------------------------------------------------
// Resize images once with the native image pipeline and cache the small JPEGs
// on disk (keyed by path + mtime + size). This is what makes browsing and
// flipping through thousands of photos fast — the full file is never loaded
// just to show a thumbnail or a preview.
function thumbDir() {
  return join(app.getPath('userData'), 'thumb-cache')
}

const thumbInFlight = new Map() // dedupe concurrent requests for the same thumb

async function getThumb(p, size) {
  let st
  try {
    st = await stat(p)
  } catch {
    return null
  }
  const key = createHash('md5').update(`${p}|${st.mtimeMs}|${size}`).digest('hex')
  const cachePath = join(thumbDir(), `${key}.jpg`)
  try {
    return await readFile(cachePath) // cache hit — instant
  } catch {
    /* generate below */
  }
  if (thumbInFlight.has(cachePath)) return thumbInFlight.get(cachePath)

  const work = (async () => {
    try {
      const img = nativeImage.createFromPath(p)
      if (img.isEmpty()) return null // unsupported format (svg/heic/…) → caller falls back
      const { width } = img.getSize()
      const resized = width > size ? img.resize({ width: size, quality: 'good' }) : img
      const buf = resized.toJPEG(82)
      await mkdir(thumbDir(), { recursive: true })
      await writeFile(cachePath, buf)
      return buf
    } catch {
      return null
    } finally {
      thumbInFlight.delete(cachePath)
    }
  })()
  thumbInFlight.set(cachePath, work)
  return work
}

// ---- Perceptual hash (dHash) for visual duplicate detection ----------------
// Shrinks the image to a 9x8 grayscale grid and encodes, per row, whether each
// pixel is brighter than its right neighbour → a 64-bit fingerprint. Two images
// with a small Hamming distance are visually the same (even if renamed, resized,
// or re-saved). Cached to disk keyed by path + mtime, like thumbnails.
function bitsToHex(bits) {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

async function imageHash(p) {
  let st
  try {
    st = await stat(p)
  } catch {
    return null
  }
  const key = createHash('md5').update(`${p}|${st.mtimeMs}|dhash`).digest('hex')
  const cachePath = join(thumbDir(), `${key}.hash`)
  try {
    return await readFile(cachePath, 'utf-8') // cache hit
  } catch {
    /* compute below */
  }
  try {
    const img = nativeImage.createFromPath(p)
    if (img.isEmpty()) return null
    const small = img.resize({ width: 9, height: 8, quality: 'good' })
    const { width, height } = small.getSize()
    const bmp = small.toBitmap() // BGRA
    const gray = new Array(width * height)
    for (let i = 0; i < width * height; i++) {
      const b = bmp[i * 4]
      const g = bmp[i * 4 + 1]
      const r = bmp[i * 4 + 2]
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
    }
    let bits = ''
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width - 1; x++) {
        bits += gray[y * width + x] < gray[y * width + x + 1] ? '1' : '0'
      }
    }
    // Pad to a multiple of 4 bits so it maps cleanly to hex.
    while (bits.length % 4) bits += '0'
    const hex = bitsToHex(bits)
    await mkdir(thumbDir(), { recursive: true })
    await writeFile(cachePath, hex, 'utf-8')
    return hex
  } catch {
    return null
  }
}

// Directories we never descend into during a disk scan (noise / system / huge).
const SKIP_DIRS = new Set([
  'node_modules', '.git', '$recycle.bin', 'windows', 'appdata',
  'system volume information', 'program files', 'program files (x86)',
  'programdata', '.cache', 'library'
])

// Recursively find files matching the given extensions. Bounded to avoid runaway.
async function scanFiles(roots, extensions, limit = 20000, onProgress) {
  const exts = new Set(extensions.map((e) => e.toLowerCase().replace(/^\./, '')))
  const results = []
  let truncated = false
  const queue = [...roots]

  while (queue.length) {
    if (results.length >= limit) {
      truncated = true
      break
    }
    const dir = queue.shift()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue // unreadable / permission denied — skip
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue
        queue.push(full)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).slice(1).toLowerCase()
        if (exts.has(ext)) {
          let size = 0
          let modified = 0
          try {
            const s = await stat(full)
            size = s.size
            modified = s.mtimeMs
          } catch {
            /* ignore */
          }
          results.push({ path: full, name: basename(full), ext, size, modified })
          if (onProgress && results.length % 100 === 0) onProgress(results.length)
          if (results.length >= limit) {
            truncated = true
            break
          }
        }
      }
    }
  }
  if (onProgress) onProgress(results.length)
  return { files: results, truncated }
}

function dataFilePath() {
  return join(app.getPath('userData'), 'notes.json')
}

async function loadData() {
  try {
    const raw = await readFile(dataFilePath(), 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    // First run (or unreadable) — return an empty store with a default notebook.
    return {
      notebooks: [{ id: 'default', name: 'My Notebook' }],
      notes: []
    }
  }
}

async function saveData(data) {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(dataFilePath(), JSON.stringify(data, null, 2), 'utf-8')
  return true
}

function createWindow() {
  // Size to fit the screen so the title bar (with minimize/close) is always reachable.
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1280, sw - 80)
  const height = Math.min(820, sh - 80)

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(820, width),
    minHeight: Math.min(520, height),
    center: true,
    show: false,
    frame: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    autoHideMenuBar: true,
    title: 'Sniddy',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.center()
    mainWindow.show()
  })

  // Surface renderer console + crashes in the dev terminal for debugging.
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const src = sourceId ? `${sourceId.split('/').pop()}:${line}` : ''
    console.log(`[renderer] ${message} ${src ? `(${src})` : ''}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, d) =>
    console.log('[renderer-gone]', JSON.stringify(d))
  )

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite injects the dev server URL in development.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Required on Windows for Notifications to actually display.
  app.setAppUserModelId('com.sniddy.desktop')

  // Serve local files for local-folder libraries. With ?t=<px> it serves a
  // cached, resized thumbnail instead of the full file (huge speed-up).
  protocol.handle('jotter-media', async (request) => {
    try {
      const url = new URL(request.url)
      const p = decodeURIComponent(url.searchParams.get('p') || '')
      const t = parseInt(url.searchParams.get('t') || '0', 10)
      if (t > 0) {
        const thumb = await getThumb(p, t)
        if (thumb) {
          return new Response(thumb, {
            headers: {
              'content-type': 'image/jpeg',
              'cache-control': 'max-age=31536000',
              'access-control-allow-origin': '*'
            }
          })
        }
        // fall through to the original file for formats we can't resize
      }
      const data = await readFile(p)
      return new Response(data, {
        headers: { 'content-type': mimeFromPath(p), 'access-control-allow-origin': '*' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  ipcMain.handle('data:load', () => loadData())
  ipcMain.handle('data:save', (_e, data) => saveData(data))

  // Per-area libraries (R2 or local folder)
  ipcMain.handle('library:getConfig', (_e, area) => storage.getLibrary(area))
  ipcMain.handle('library:ensure', (_e, area) => storage.ensureLibrary(area))
  ipcMain.handle('library:setConfig', (_e, area, cfg) => storage.setLibrary(area, cfg))
  ipcMain.handle('library:list', (_e, area, sub) => storage.libraryList(area, sub))
  ipcMain.handle('library:url', (_e, area, sub) => storage.libraryUrl(area, sub))
  ipcMain.handle('library:import', (_e, area, dest, srcPath, ct) =>
    storage.libraryImport(area, dest, srcPath, ct)
  )
  ipcMain.handle('library:createGroup', (_e, area, name) => storage.createGroup(area, name))
  // Save a data-URL capture (screen grab / browser shot) into a library.
  ipcMain.handle('library:saveDataUrl', async (_e, area, destSub, filename, dataUrl) => {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''))
    if (!m) throw new Error('Not a data URL')
    const ct = m[1] || 'image/png'
    const buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]))
    return storage.saveBytes(area, destSub, filename, buffer, ct)
  })
  ipcMain.handle('library:removeGroup', (_e, area, name) => storage.removeGroupFolder(area, name))
  ipcMain.handle('library:remove', (_e, area, sub) => storage.libraryRemove(area, sub))
  ipcMain.handle('library:shareLink', (_e, area, sub) => storage.shareLink(area, sub))
  ipcMain.handle('library:rename', (_e, area, sub, name) => storage.libraryRename(area, sub, name))
  ipcMain.handle('library:counts', (_e, area) => storage.libraryCounts(area))

  // Object storage (R2 / Wasabi / any S3-compatible)
  ipcMain.handle('storage:getConfig', () => storage.getConfig())
  ipcMain.handle('storage:setConfig', (_e, cfg) => storage.setConfig(cfg))
  ipcMain.handle('storage:test', () => storage.testConnection())
  ipcMain.handle('storage:list', (_e, prefix) => storage.list(prefix))
  ipcMain.handle('storage:getUrl', (_e, key) => storage.getUrl(key))
  ipcMain.handle('storage:upload', (_e, key, filePath, contentType) =>
    storage.uploadFile(key, filePath, contentType)
  )

  // Disk scanning + folder picking (for Files / Images areas)
  // Simple screen capture — hide our own window, grab each display, restore.
  ipcMain.handle('capture:screen', async () => {
    const wasVisible = mainWindow.isVisible()
    mainWindow.minimize()
    await new Promise((r) => setTimeout(r, 350))
    try {
      const shots = await Promise.all(
        screen.getAllDisplays().map(async (display, i) => {
          const { width, height } = display.size
          const scale = display.scaleFactor || 1
          const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
          })
          // Match the source to this display when possible, else fall back by index.
          const match =
            sources.find((s) => String(s.display_id) === String(display.id)) || sources[i] || sources[0]
          return { name: `Display ${i + 1}`, dataUrl: match ? match.thumbnail.toDataURL() : null }
        })
      )
      return shots.filter((s) => s.dataUrl)
    } finally {
      if (wasVisible) mainWindow.restore()
    }
  })

  ipcMain.handle('fs:pickFolders', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'multiSelections']
    })
    return res.canceled ? [] : res.filePaths
  })
  ipcMain.handle('fs:commonFolders', () => {
    const get = (n) => {
      try {
        return app.getPath(n)
      } catch {
        return null
      }
    }
    return [
      { label: 'Desktop', path: get('desktop') },
      { label: 'Downloads', path: get('downloads') },
      { label: 'Documents', path: get('documents') },
      { label: 'Pictures', path: get('pictures') },
      { label: 'Home', path: get('home') }
    ].filter((f) => f.path)
  })
  ipcMain.handle('fs:pickFiles', async (_e, extensions) => {
    const filters = extensions?.length ? [{ name: 'Files', extensions }] : []
    const res = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters
    })
    return res.canceled ? [] : res.filePaths
  })
  ipcMain.handle('fs:scan', (e, roots, extensions) =>
    scanFiles(roots, extensions, 20000, (found) => {
      try {
        e.sender.send('scan:progress', found)
      } catch {
        /* window may be gone */
      }
    })
  )
  ipcMain.handle('fs:listFolder', (_e, dir) => listFolder(dir))
  ipcMain.handle('fs:imageHash', (_e, p) => imageHash(p))
  ipcMain.handle('fs:trashFile', async (_e, filePath) => {
    await shell.trashItem(normalize(filePath)) // native path → Recycle Bin, not permanent
    return true
  })
  ipcMain.handle('fs:showInFolder', (_e, filePath) => {
    shell.showItemInFolder(filePath) // reveal in Explorer
    return true
  })

  startReceiver() // loopback endpoint for the Sniddy Chrome extension

  // ---- Print Screen → crosshair region picker --------------------------------
  // Pressing Print Screen freezes the screen under the cursor and shows a
  // crosshair: drag to capture a region, Enter for the whole screen, Esc out.
  let regionWin = null
  let regionShot = null // { path, scale }

  function closeRegion() {
    if (regionWin && !regionWin.isDestroyed()) regionWin.destroy()
    regionWin = null
  }

  function notifyCaptured(body) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shots:captured')
    try {
      new Notification({ title: '📸 Captured to Sniddy', body, silent: true }).show()
    } catch {
      /* notifications unavailable */
    }
  }

  const stampNow = () => {
    const t = new Date()
    const p = (n) => String(n).padStart(2, '0')
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}.${p(t.getMinutes())}.${p(t.getSeconds())}`
  }

  async function captureAllDisplays() {
    const lib = await storage.ensureLibrary('screenshots')
    if (!lib) return
    const displays = screen.getAllDisplays()
    const stampStr = stampNow()
    for (let i = 0; i < displays.length; i++) {
      const display = displays[i]
      const { width, height } = display.size
      const scale = display.scaleFactor || 1
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
      })
      const match =
        sources.find((s) => String(s.display_id) === String(display.id)) || sources[i] || sources[0]
      if (!match) continue
      const buf = match.thumbnail.toPNG()
      const name = `PrintScreen ${stampStr}${displays.length > 1 ? ` (${i + 1})` : ''}.png`
      await storage.saveBytes('screenshots', '', name, buf, 'image/png')
    }
    notifyCaptured(
      `Saved to Shots${displays.length > 1 ? ` (${displays.length} monitors)` : ''}.`
    )
  }

  async function startRegionPick() {
    const pt = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(pt)
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const match = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0]
    if (!match) return
    const tmpPath = join(app.getPath('userData'), 'region-freeze.png')
    await writeFile(tmpPath, match.thumbnail.toPNG())
    regionShot = { path: tmpPath, scale, display }
    regionWin = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const imgUrl = `jotter-media://f/?p=${encodeURIComponent(tmpPath)}`
    const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;cursor:crosshair;user-select:none;background:#000">
<img src="${imgUrl}" draggable="false" style="position:fixed;inset:0;width:100vw;height:100vh">
<div id="dim" style="position:fixed;inset:0;background:rgba(10,12,16,.32);pointer-events:none;transition:opacity .15s"></div>
<div id="hl" style="position:fixed;left:0;width:100vw;height:1px;background:rgba(139,92,246,.95);box-shadow:0 0 6px rgba(139,92,246,.8);pointer-events:none"></div>
<div id="vl" style="position:fixed;top:0;height:100vh;width:1px;background:rgba(139,92,246,.95);box-shadow:0 0 6px rgba(139,92,246,.8);pointer-events:none"></div>
<div id="bx" style="position:fixed;display:none;border:1.5px solid #a78bfa;border-radius:2px;box-shadow:0 0 0 100vmax rgba(10,12,16,.55), 0 0 18px rgba(139,92,246,.5);pointer-events:none"></div>
<div id="sz" style="position:fixed;display:none;background:#1f2430;color:#e8ecf1;padding:3px 9px;border-radius:6px;font:600 12px system-ui;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.45)"></div>
<div id="tip" style="position:fixed;top:22px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:rgba(20,23,28,.92);color:#e8ecf1;padding:10px 16px;border-radius:12px;font:13px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.5);backdrop-filter:blur(6px)">
  <span style="width:24px;height:24px;border-radius:7px;background:linear-gradient(140deg,#8b5cf6,#6d28d9);display:grid;place-items:center;font:800 13px system-ui;color:#fff">J</span>
  <span>Drag to capture an area</span>
  <span style="color:#9aa4b2">&middot;&nbsp; Enter = whole screen &nbsp;&middot;&nbsp; Esc = cancel</span>
</div>
<script>
  const $=(i)=>document.getElementById(i)
  let d=false,sx=0,sy=0
  function draw(e){const l=Math.min(sx,e.clientX),t=Math.min(sy,e.clientY),w=Math.abs(e.clientX-sx),h=Math.abs(e.clientY-sy)
    const b=$('bx');b.style.left=l+'px';b.style.top=t+'px';b.style.width=w+'px';b.style.height=h+'px'
    const s=$('sz');s.style.display='block';s.textContent=w+' × '+h
    s.style.left=Math.min(l,innerWidth-90)+'px';s.style.top=Math.max(4,t-26)+'px'
    return[l,t,w,h]}
  onmousemove=(e)=>{$('hl').style.top=e.clientY+'px';$('vl').style.left=e.clientX+'px';if(d)draw(e)}
  onmousedown=(e)=>{if(e.button!==0)return;d=true;sx=e.clientX;sy=e.clientY
    $('tip').style.display='none';$('dim').style.opacity='0';$('bx').style.display='block';draw(e)}
  onmouseup=(e)=>{if(!d)return;d=false;const[l,t,w,h]=draw(e)
    if(w<5||h<5){window.api.chooseCapture('close');return}
    window.api.chooseCapture('regiondone:'+l+','+t+','+w+','+h)}
  addEventListener('keydown',(e)=>{
    if(e.key==='Escape')window.api.chooseCapture('close')
    if(e.key==='Enter')window.api.chooseCapture('visible')
  })
</script></body>`
    regionWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    regionWin.once('ready-to-show', () => {
      if (regionWin && !regionWin.isDestroyed()) {
        regionWin.setBounds(display.bounds)
        regionWin.show()
        regionWin.focus()
      }
    })
  }

  // ---- Post-capture decision card (desktop) ---------------------------------
  let cardWin = null
  let cardCtx = null // { path, display, savedSub }
  const CARD_W = 448
  const CARD_H = 360

  function closeCard() {
    if (cardWin && !cardWin.isDestroyed()) cardWin.destroy()
    cardWin = null
    cardCtx = null
  }

  function cardBounds(display, big) {
    if (!big) {
      return {
        x: Math.round(display.bounds.x + display.bounds.width - CARD_W - 16),
        y: Math.round(display.bounds.y + display.bounds.height - CARD_H - 16),
        width: CARD_W,
        height: CARD_H
      }
    }
    const w = Math.round(display.bounds.width * 0.86)
    const h = Math.round(display.bounds.height * 0.86)
    return {
      x: Math.round(display.bounds.x + (display.bounds.width - w) / 2),
      y: Math.round(display.bounds.y + (display.bounds.height - h) / 2),
      width: w,
      height: h
    }
  }

  async function openCaptureCard(pngBuffer, display) {
    closeCard()
    const pendingPath = join(app.getPath('userData'), 'pending-shot.png')
    await writeFile(pendingPath, pngBuffer)
    cardCtx = { path: pendingPath, display, savedSub: null }
    cardWin = new BrowserWindow({
      ...cardBounds(display, false),
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const imgUrl = `jotter-media://f/?p=${encodeURIComponent(pendingPath)}&v=${Date.now()}`
    cardWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(buildCardHtml(imgUrl)))
    cardWin.once('ready-to-show', () => {
      if (cardWin && !cardWin.isDestroyed()) cardWin.show()
    })
  }

  ipcMain.handle('capture:card', async (_e, payload = {}) => {
    try {
      const action = payload.action
      if (action === 'close') {
        closeCard()
        return { ok: true }
      }
      if (action === 'discard') {
        // If it was saved from this card, remove it from Sniddy too.
        if (cardCtx?.savedSub) {
          try {
            await storage.libraryRemove('screenshots', cardCtx.savedSub)
          } catch {
            /* already gone */
          }
        }
        closeCard()
        return { ok: true }
      }
      if (action === 'edit') {
        if (cardWin && !cardWin.isDestroyed() && cardCtx) {
          cardWin.setBounds(cardBounds(cardCtx.display, !!payload.open))
        }
        return { ok: true }
      }
      if (action === 'download') {
        let buffer
        if (payload.dataUrl) {
          const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(payload.dataUrl)
          if (!m) return { ok: false, error: 'Bad image data' }
          buffer = Buffer.from(m[3], 'base64')
        } else {
          buffer = await readFile(cardCtx.path)
        }
        const dest = join(app.getPath('downloads'), `Sniddy Capture ${stampNow()}.png`)
        await writeFile(dest, buffer)
        return { ok: true, path: dest }
      }
      if (action === 'save') {
        const lib = await storage.ensureLibrary('screenshots')
        if (!lib) return { ok: false, error: 'Set up a storage location in Sniddy first.' }
        let buffer
        if (payload.dataUrl) {
          const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(payload.dataUrl)
          if (!m) return { ok: false, error: 'Bad image data' }
          buffer = Buffer.from(m[3], 'base64')
        } else {
          buffer = await readFile(cardCtx.path)
        }
        const r = await storage.saveBytes(
          'screenshots',
          '',
          `Selection ${stampNow()}.png`,
          buffer,
          'image/png'
        )
        // Re-saving after an edit replaces the earlier copy.
        if (cardCtx.savedSub && cardCtx.savedSub !== r.sub) {
          try {
            await storage.libraryRemove('screenshots', cardCtx.savedSub)
          } catch {
            /* ignore */
          }
        }
        cardCtx.savedSub = r.sub
        return { ok: true, sub: r.sub }
      }
      return { ok: false, error: 'Unknown action' }
    } catch (e) {
      return { ok: false, error: e?.message || 'Failed' }
    }
  })

  function buildCardHtml(imgUrl) {
    return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent;overflow:hidden;height:100vh;font:13px system-ui;color:#e8ecf1">
<div id="card" style="position:fixed;inset:8px;background:#1f2430;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.55);display:flex;flex-direction:column;overflow:hidden">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px">
    <span style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:13.5px"><span style="width:20px;height:20px;border-radius:5px;background:linear-gradient(140deg,#6bc23a,#2563eb);display:grid;place-items:center;font-weight:800;font-size:12px">S</span>Sniddy</span>
    <span style="display:flex;gap:2px;align-items:center">
      <button id="bedit" class="ib" title="Edit / annotate"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></button>
      <button id="bdel" class="ib danger" title="Discard"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
      <button id="bx" class="ib" title="Close" style="font-size:14px">✕</button>
    </span>
  </div>
  <div style="padding:0 12px 9px"><b id="ttl" style="font-size:11.5px;color:#9aa4b2;font-weight:600">📸 Captured — not saved yet</b></div>
  <img id="shot" src="${imgUrl}" style="flex:1;min-height:0;object-fit:contain;background:#12151a;width:100%">
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:10px 12px">
    <button id="bdl" class="b"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>
    <button id="bsave" class="b"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save</button>
    <button id="bshare" class="b"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share</button>
    <button id="bboth" class="b"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Save + Share</button>
  </div>
  <div id="toast" style="position:absolute;left:50%;bottom:10px;transform:translateX(-50%);background:#fff;color:#12151a;font-weight:600;font-size:12px;padding:6px 12px;border-radius:999px;opacity:0;transition:.2s;pointer-events:none;white-space:nowrap"></div>
</div>
<div id="ed" style="display:none;position:fixed;inset:8px;background:rgba(12,14,18,.97);border-radius:14px;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden">
  <div id="tools" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;justify-content:center;background:#1f2430;padding:7px 9px;border-radius:10px">
    <button class="t tl on" data-tool="pen">✏️ Pen</button>
    <button class="t tl" data-tool="hl">🖍 Highlight</button>
    <button class="t tl" data-tool="box">▭ Box</button>
    <button class="t tl" data-tool="arrow">↗ Arrow</button>
    <button class="t tl" data-tool="text">T Text</button>
    <button class="t tl" data-tool="blur">▩ Blur</button>
    <button class="t tl" data-tool="crop">✂ Crop</button>
    <button class="sw on" data-c="#e5484d" style="background:#e5484d"></button>
    <button class="sw" data-c="#ffe600" style="background:#ffe600"></button>
    <button class="sw" data-c="#2563eb" style="background:#2563eb"></button>
    <button class="sw" data-c="#111111" style="background:#111"></button>
    <button class="t" id="bundo">↶ Undo</button>
    <button class="t" id="bcancel">Cancel</button>
    <button class="t" id="bok" style="background:#16a34a;border-color:#16a34a">✓ Apply</button>
  </div>
  <canvas id="cv" style="max-width:calc(100% - 24px);max-height:calc(100% - 76px);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6);cursor:crosshair;background:#fff"></canvas>
</div>
<style>
  .ib{border:none;background:none;color:#9aa4b2;cursor:pointer;padding:5px;border-radius:6px;display:grid;place-items:center}
  .ib:hover{color:#fff;background:#2d3440}
  .ib.danger:hover{background:#e5484d;color:#fff}
  .b{border:none;border-radius:8px;padding:8px 4px;cursor:pointer;font-weight:600;font-size:12px;background:#2d3440;color:#e8ecf1;display:flex;flex-direction:column;align-items:center;gap:3px}
  .b:hover{background:#3a4250}
  .t{border:1px solid #3a4250;background:#2d3440;color:#e8ecf1;border-radius:7px;padding:5px 9px;cursor:pointer;font:600 12px system-ui}
  .t.on{background:#2563eb;border-color:#2563eb}
  .sw{width:20px;height:20px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
  .sw.on{border-color:#fff}
</style>
<script>
  var IMG='${imgUrl}'
  var current=null, saved=false
  function $(i){return document.getElementById(i)}
  var toastT
  function toast(m){var t=$('toast');t.textContent=m;t.style.opacity='1';clearTimeout(toastT);toastT=setTimeout(function(){t.style.opacity='0'},1900)}
  function getDataUrl(){if(current)return Promise.resolve(current)
    return fetch(IMG).then(function(r){return r.blob()}).then(function(b){return new Promise(function(res){var fr=new FileReader();fr.onload=function(){res(fr.result)};fr.readAsDataURL(b)})})}
  function doSave(cb){toast('Saving…')
    var p=current?Promise.resolve(current):Promise.resolve(null)
    p.then(function(du){return window.api.cardAction({action:'save',dataUrl:du})}).then(function(r){
      if(r&&r.ok){saved=true;$('ttl').textContent='📸 Captured — saved to Sniddy';toast('Saved to Sniddy ✓')}
      else toast((r&&r.error)||'Save failed')
      if(cb)cb(r&&r.ok)})}
  function doShare(){toast('Creating link…')
    getDataUrl().then(function(du){return fetch('https://jotter-share.chad-nicely.workers.dev/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataUrl:du})})})
    .then(function(r){return r.json()}).then(function(o){
      if(o.ok){navigator.clipboard.writeText(o.url).then(function(){toast('Link copied — expires in 7 days')}).catch(function(){toast(o.url)})}
      else toast(o.error||'Share failed')
    }).catch(function(){toast('Share failed')})}
  $('bdl').onclick=function(){toast('Downloading…')
    var p=current?Promise.resolve(current):Promise.resolve(null)
    p.then(function(du){return window.api.cardAction({action:'download',dataUrl:du})}).then(function(r){
      toast(r&&r.ok?'Saved to your Downloads folder ✓':(r&&r.error)||'Download failed')})}
  $('bsave').onclick=function(){doSave()}
  $('bshare').onclick=function(){doShare()}
  $('bboth').onclick=function(){doSave(function(ok){if(ok)doShare()})}
  $('bdel').onclick=function(){window.api.cardAction({action:'discard'})}
  $('bx').onclick=function(){window.api.cardAction({action:'close'})}
  addEventListener('keydown',function(e){if(e.key==='Escape'&&$('ed').style.display==='none')window.api.cardAction({action:'close'})})

  // ---- Annotator ----
  var tool='pen',color='#e5484d',drawing=false,sx=0,sy=0,snap=null
  var undoStack=[]
  var cv=$('cv'),ctx=cv.getContext('2d')
  function lw(){return Math.max(3,Math.round(cv.width/300))}
  function pos(e){var r=cv.getBoundingClientRect()
    return [ (e.clientX-r.left)/r.width*cv.width, (e.clientY-r.top)/r.height*cv.height ]}
  $('bedit').onclick=function(){
    window.api.cardAction({action:'edit',open:true}).then(function(){
      var im=new Image()
      im.onload=function(){cv.width=im.naturalWidth;cv.height=im.naturalHeight;ctx.drawImage(im,0,0)
        undoStack=[];$('ed').style.display='flex'}
      im.src=current||IMG})}
  function closeEd(){$('ed').style.display='none';window.api.cardAction({action:'edit',open:false})}
  $('bcancel').onclick=closeEd
  $('bok').onclick=function(){current=cv.toDataURL('image/png');$('shot').src=current
    toast(saved?'Edited — hit Save to update':'Edited — now Save or Share');closeEd()}
  $('bundo').onclick=function(){var prev=undoStack.pop();if(!prev)return
    var im=new Image();im.onload=function(){cv.width=im.width;cv.height=im.height;ctx.drawImage(im,0,0)};im.src=prev}
  var tls=document.querySelectorAll('.tl')
  tls.forEach(function(b){b.onclick=function(){tls.forEach(function(x){x.classList.remove('on')});b.classList.add('on');tool=b.dataset.tool}})
  var sws=document.querySelectorAll('.sw')
  sws.forEach(function(b){b.onclick=function(){sws.forEach(function(x){x.classList.remove('on')});b.classList.add('on');color=b.dataset.c}})
  function addText(cx,cy,clientX,clientY){
    var inp=document.createElement('input')
    inp.style.cssText='position:fixed;left:'+clientX+'px;top:'+clientY+'px;z-index:9;background:#fff;color:#111;border:2px solid #2563eb;border-radius:6px;padding:4px 8px;font:600 14px system-ui;outline:none'
    document.body.appendChild(inp);setTimeout(function(){inp.focus()},30)
    inp.onkeydown=function(e){
      if(e.key==='Enter'){var v=inp.value.trim();inp.remove()
        if(v){undoStack.push(cv.toDataURL())
          ctx.fillStyle=color;ctx.font='bold '+Math.max(18,Math.round(cv.width/40))+'px system-ui'
          ctx.fillText(v,cx,cy)}}
      if(e.key==='Escape')inp.remove()}}
  cv.addEventListener('mousedown',function(e){var p=pos(e),x=p[0],y=p[1]
    if(tool==='text'){addText(x,y,e.clientX,e.clientY);return}
    if(undoStack.length>19)undoStack.shift()
    undoStack.push(cv.toDataURL())
    drawing=true;sx=x;sy=y;snap=ctx.getImageData(0,0,cv.width,cv.height)
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=lw();ctx.lineCap='round';ctx.lineJoin='round'
    if(tool==='pen'){ctx.beginPath();ctx.moveTo(x,y)}})
  cv.addEventListener('mousemove',function(e){if(!drawing)return
    var p=pos(e),x=p[0],y=p[1]
    if(tool==='pen'){ctx.lineTo(x,y);ctx.stroke()}
    else if(tool==='hl'){ctx.putImageData(snap,0,0);ctx.globalAlpha=.35;ctx.fillRect(sx,sy,x-sx,y-sy);ctx.globalAlpha=1}
    else if(tool==='box'){ctx.putImageData(snap,0,0);ctx.strokeRect(sx,sy,x-sx,y-sy)}
    else if(tool==='arrow'){ctx.putImageData(snap,0,0)
      ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(x,y);ctx.stroke()
      var a=Math.atan2(y-sy,x-sx),h=lw()*4
      ctx.beginPath();ctx.moveTo(x,y)
      ctx.lineTo(x-h*Math.cos(a-.45),y-h*Math.sin(a-.45))
      ctx.lineTo(x-h*Math.cos(a+.45),y-h*Math.sin(a+.45))
      ctx.closePath();ctx.fill()}
    else if(tool==='blur'||tool==='crop'){ctx.putImageData(snap,0,0)
      ctx.save();ctx.setLineDash([10,7]);ctx.strokeStyle=tool==='crop'?'#2563eb':'#fff';ctx.lineWidth=Math.max(2,lw()/2)
      ctx.strokeRect(sx,sy,x-sx,y-sy);ctx.restore()}})
  cv.addEventListener('mouseup',function(e){if(!drawing)return
    drawing=false
    var p=pos(e),x=p[0],y=p[1]
    var rx=Math.round(Math.min(sx,x)),ry=Math.round(Math.min(sy,y)),rw=Math.round(Math.abs(x-sx)),rh=Math.round(Math.abs(y-sy))
    if(tool==='blur'){ctx.putImageData(snap,0,0);if(rw<6||rh<6)return
      var block=Math.max(8,Math.round(Math.max(rw,rh)/14))
      var tmp=document.createElement('canvas');tmp.width=Math.max(1,Math.ceil(rw/block));tmp.height=Math.max(1,Math.ceil(rh/block))
      tmp.getContext('2d').drawImage(cv,rx,ry,rw,rh,0,0,tmp.width,tmp.height)
      ctx.imageSmoothingEnabled=false
      ctx.drawImage(tmp,0,0,tmp.width,tmp.height,rx,ry,rw,rh)
      ctx.imageSmoothingEnabled=true}
    else if(tool==='crop'){ctx.putImageData(snap,0,0);if(rw<20||rh<20)return
      var t2=document.createElement('canvas');t2.width=rw;t2.height=rh
      t2.getContext('2d').drawImage(cv,rx,ry,rw,rh,0,0,rw,rh)
      cv.width=rw;cv.height=rh;ctx.drawImage(t2,0,0)}})
</script></body>`
  }

  ipcMain.on('capture:choose', async (_e, mode) => {
    try {
      if (mode === 'close') {
        closeRegion()
        return
      }
      if (mode === 'visible') {
        // Enter inside the picker = capture the whole screen(s).
        closeRegion()
        setTimeout(() => captureAllDisplays().catch((e) => console.error('[printscreen]', e?.message)), 200)
        return
      }
      if (String(mode).startsWith('regiondone:')) {
        closeRegion()
        if (!regionShot) return
        const [l, t, w, h] = String(mode).slice('regiondone:'.length).split(',').map(Number)
        const s = regionShot.scale
        const img = nativeImage.createFromPath(regionShot.path)
        const crop = img.crop({
          x: Math.max(0, Math.round(l * s)),
          y: Math.max(0, Math.round(t * s)),
          width: Math.max(1, Math.round(w * s)),
          height: Math.max(1, Math.round(h * s))
        })
        // Shutter sound (played by the app window), then the decision card —
        // nothing is saved until the user picks Save / Share on it.
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shots:captured')
        await openCaptureCard(crop.toPNG(), regionShot.display)
      }
    } catch (e) {
      console.error('[printscreen]', e?.message)
    }
  })

  const psRegistered = globalShortcut.register('PrintScreen', () => {
    if (regionWin) {
      closeRegion() // pressing again toggles it away
      return
    }
    startRegionPick().catch((e) => console.error('[printscreen]', e?.message))
  })
  if (!psRegistered) {
    console.log('[printscreen] key not registrable (Electron/Windows limitation) — using clipboard watcher instead.')
    // Fallback: with the Snipping toggle off, Print Screen copies the screen to
    // the clipboard. Watch for fresh screen-sized images and file them into
    // Shots. Seeded with the current clipboard so an OLD screenshot sitting
    // there isn't imported — only new ones from now on.
    const hashImg = (buf) => createHash('md5').update(buf).digest('hex')
    let lastClip = ''
    try {
      const seed = clipboard.readImage()
      if (!seed.isEmpty()) lastClip = hashImg(seed.toPNG())
    } catch {
      /* empty clipboard */
    }
    setInterval(async () => {
      try {
        const img = clipboard.readImage()
        if (img.isEmpty()) return
        const { width, height } = img.getSize()
        // Only treat images that match a display — or the combined multi-monitor
        // desktop — as Print Screens, so ordinary copied images never auto-import.
        const displays = screen.getAllDisplays()
        const singleMatch = displays.some((d) => {
          const s = d.scaleFactor || 1
          return (
            Math.abs(d.size.width * s - width) <= 4 && Math.abs(d.size.height * s - height) <= 4
          )
        })
        let L = Infinity, T = Infinity, R = -Infinity, B = -Infinity
        for (const d of displays) {
          const s = d.scaleFactor || 1
          L = Math.min(L, d.bounds.x * s)
          T = Math.min(T, d.bounds.y * s)
          R = Math.max(R, (d.bounds.x + d.bounds.width) * s)
          B = Math.max(B, (d.bounds.y + d.bounds.height) * s)
        }
        const unionMatch = Math.abs(R - L - width) <= 8 && Math.abs(B - T - height) <= 8
        if (!singleMatch && !unionMatch) return
        const buf = img.toPNG()
        const hash = hashImg(buf)
        if (hash === lastClip) return
        lastClip = hash
        const lib = await storage.ensureLibrary('screenshots')
        if (!lib) return
        const t = new Date()
        const p = (n) => String(n).padStart(2, '0')
        const name = `PrintScreen ${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}.${p(t.getMinutes())}.${p(t.getSeconds())}.png`
        await storage.saveBytes('screenshots', '', name, buf, 'image/png')
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('shots:captured')
        console.log('[printscreen] clipboard capture saved:', name)
        // Visible feedback — otherwise the capture lands silently.
        try {
          new Notification({
            title: '📸 Captured to Sniddy',
            body: 'Your Print Screen was saved to Shots.',
            silent: true
          }).show()
        } catch {
          /* notifications unavailable */
        }
      } catch {
        /* clipboard may be busy — try again next tick */
      }
    }, 900)
  }

  startAuthServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  if (authServerProc) authServerProc.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
