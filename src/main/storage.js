// S3-compatible object storage adapter — works for Cloudflare R2, Wasabi,
// Backblaze B2, or any S3-compatible endpoint. Config is user-supplied in Settings.
import { app, shell } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { readFile, writeFile, mkdir, readdir, stat, copyFile, rename } from 'fs/promises'
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadBucketCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|tiff?)$/i

let client = null
let clientKey = '' // fingerprint of the config the current client was built from

function configPath() {
  return join(app.getPath('userData'), 'storage-config.json')
}

export async function getConfig() {
  try {
    return JSON.parse(await readFile(configPath(), 'utf-8'))
  } catch {
    return { provider: 'r2', endpoint: '', region: 'auto', accessKeyId: '', secretAccessKey: '', bucket: '' }
  }
}

export async function setConfig(cfg) {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(configPath(), JSON.stringify(cfg, null, 2), 'utf-8')
  client = null // force rebuild on next use
  return true
}

function buildClient(cfg) {
  const key = JSON.stringify([cfg.endpoint, cfg.region, cfg.accessKeyId, cfg.secretAccessKey])
  if (client && clientKey === key) return client
  client = new S3Client({
    region: cfg.region || 'auto',
    endpoint: cfg.endpoint,
    forcePathStyle: true, // broadest compatibility across S3-compatible providers
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    }
  })
  clientKey = key
  return client
}

async function resolveClient() {
  const cfg = await getConfig()
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new Error('Storage is not configured. Open Settings and enter your bucket details.')
  }
  return { c: buildClient(cfg), cfg }
}

// Validate credentials by checking the bucket exists / is reachable.
export async function testConnection() {
  const { c, cfg } = await resolveClient()
  await c.send(new HeadBucketCommand({ Bucket: cfg.bucket }))
  return true
}

// List one "folder" level: subfolders (common prefixes) + image objects.
export async function list(prefix = '') {
  const { c, cfg } = await resolveClient()
  const out = await c.send(
    new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: prefix,
      Delimiter: '/'
    })
  )
  const folders = (out.CommonPrefixes || []).map((p) => ({
    prefix: p.Prefix,
    name: p.Prefix.slice(prefix.length).replace(/\/$/, '')
  }))
  const images = (out.Contents || [])
    .filter((o) => o.Key !== prefix && IMAGE_RE.test(o.Key))
    .map((o) => ({
      key: o.Key,
      name: o.Key.slice(prefix.length),
      size: o.Size,
      modified: o.LastModified ? new Date(o.LastModified).getTime() : 0
    }))
  return { folders, images }
}

// Presigned GET URL — works for private buckets, expires after the given seconds.
export async function getUrl(key, expiresIn = 3600) {
  const { c, cfg } = await resolveClient()
  return getSignedUrl(c, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn })
}

// Upload a local file's bytes to the given key.
export async function uploadFile(key, filePath, contentType) {
  const { c, cfg } = await resolveClient()
  const body = await readFile(filePath)
  await c.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  )
  return true
}

// ---------------------------------------------------------------------------
// Per-area libraries. A "library" has a root that is EITHER an R2 prefix or a
// local folder. Groups are just subfolders under that root.
// ---------------------------------------------------------------------------

function librariesPath() {
  return join(app.getPath('userData'), 'libraries.json')
}

export async function getLibraries() {
  try {
    return JSON.parse(await readFile(librariesPath(), 'utf-8'))
  } catch {
    return {}
  }
}

export async function getLibrary(area) {
  return (await getLibraries())[area] || null
}

// If this area isn't set up, inherit the location from any area that is
// (as a sibling subfolder for local, or an area-named prefix for R2), so the
// user only has to pick a location once.
const LIBRARY_AREAS = ['images', 'videos', 'files', 'screenshots']
export async function ensureLibrary(area) {
  const all = await getLibraries()
  if (all[area]) return all[area]
  const src = LIBRARY_AREAS.map((a) => all[a]).find(Boolean)
  if (!src) return null
  const cap = area.charAt(0).toUpperCase() + area.slice(1)
  const cfg =
    src.mode === 'local'
      ? { mode: 'local', localPath: join(dirname(src.localPath), cap) }
      : { mode: 'r2', prefix: `${area}/` }
  await setLibrary(area, cfg)
  return cfg
}

export async function setLibrary(area, cfg) {
  const all = await getLibraries()
  all[area] = cfg
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(librariesPath(), JSON.stringify(all, null, 2), 'utf-8')
  return true
}

// Normalize a folder path to forward slashes with a trailing slash ('' = root).
function folderSub(sub) {
  let s = String(sub || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (s && !s.endsWith('/')) s += '/'
  return s
}

function r2Base(lib) {
  let b = String(lib.prefix || '').replace(/^\/+/, '')
  if (b && !b.endsWith('/')) b += '/'
  return b
}

function requireLib(lib) {
  if (!lib) {
    const e = new Error('This library is not set up yet.')
    e.code = 'NO_LIBRARY'
    throw e
  }
  return lib
}

async function listLocal(base, fsub) {
  const dir = join(base, fsub)
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return { folders: [], items: [] }
  }
  const folders = []
  const items = []
  for (const e of entries) {
    if (e.isDirectory()) {
      folders.push({ name: e.name, sub: fsub + e.name + '/' })
    } else if (e.isFile() && IMAGE_RE.test(e.name)) {
      let size = 0
      let modified = 0
      try {
        const st = await stat(join(dir, e.name))
        size = st.size
        modified = st.mtimeMs
      } catch {
        /* ignore */
      }
      items.push({ name: e.name, sub: fsub + e.name, size, modified })
    }
  }
  return { folders, items }
}

export async function libraryList(area, sub = '') {
  const lib = requireLib(await getLibrary(area))
  const fsub = folderSub(sub)
  if (lib.mode === 'local') return listLocal(lib.localPath, fsub)

  const prefix = r2Base(lib) + fsub
  const { c, cfg } = await resolveClient()
  const out = await c.send(
    new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, Delimiter: '/' })
  )
  const folders = (out.CommonPrefixes || []).map((p) => {
    const name = p.Prefix.slice(prefix.length).replace(/\/$/, '')
    return { name, sub: fsub + name + '/' }
  })
  const items = (out.Contents || [])
    .filter((o) => o.Key !== prefix && IMAGE_RE.test(o.Key))
    .map((o) => ({
      name: o.Key.slice(prefix.length),
      sub: fsub + o.Key.slice(prefix.length),
      size: o.Size,
      modified: o.LastModified ? new Date(o.LastModified).getTime() : 0
    }))
  return { folders, items }
}

export async function libraryUrl(area, fileSub) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(fileSub || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (lib.mode === 'local') {
    const abs = join(lib.localPath, clean)
    return `jotter-media://f/?p=${encodeURIComponent(abs)}`
  }
  const { c, cfg } = await resolveClient()
  return getSignedUrl(c, new GetObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + clean }), {
    expiresIn: 3600
  })
}

// Create a shareable link to an item that anyone can open — a presigned URL from
// the user's own R2/S3 bucket. Max lifetime is 7 days (604800s), the S3 cap.
// If the item lives in a local library, we upload a copy to the bucket under
// shared/ first (so a local-only file becomes reachable), then presign that.
const SHARE_TTL = 604800 // 7 days
export async function shareLink(area, fileSub) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(fileSub || '').replace(/\\/g, '/').replace(/^\/+/, '')

  if (lib.mode === 'r2') {
    const { c, cfg } = await resolveClient()
    return getSignedUrl(c, new GetObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + clean }), {
      expiresIn: SHARE_TTL
    })
  }

  // Local item — needs a bucket to be shareable.
  const conf = await getConfig()
  if (!conf.endpoint || !conf.accessKeyId || !conf.secretAccessKey || !conf.bucket) {
    const e = new Error('Add your R2 bucket in Settings to create share links.')
    e.code = 'NO_R2'
    throw e
  }
  const { c, cfg } = await resolveClient()
  const abs = join(lib.localPath, clean)
  const name = basename(abs)
  const key = `shared/${Date.now()}-${name}`
  const body = await readFile(abs)
  await c.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: mimeForName(name) })
  )
  return getSignedUrl(c, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
    expiresIn: SHARE_TTL
  })
}

const IMPORT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
  svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', flv: 'video/x-flv', avi: 'video/x-msvideo',
  mkv: 'video/x-matroska', webm: 'video/webm', m4v: 'video/x-m4v',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', ogg: 'audio/ogg', pdf: 'application/pdf'
}
function mimeForName(name) {
  return IMPORT_MIME[extname(name).slice(1).toLowerCase()] || 'application/octet-stream'
}

export async function libraryImport(area, destSub, srcPath, contentType) {
  const lib = requireLib(await getLibrary(area))
  const name = basename(srcPath)
  const ct = contentType || mimeForName(name)
  const fsub = folderSub(destSub)
  if (lib.mode === 'local') {
    const destDir = join(lib.localPath, fsub)
    await mkdir(destDir, { recursive: true })
    await copyFile(srcPath, join(destDir, name))
    return true
  }
  const { c, cfg } = await resolveClient()
  const body = await readFile(srcPath)
  await c.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + fsub + name, Body: body, ContentType: ct })
  )
  return true
}

// Save an in-memory buffer straight into a library (used by screen/browser
// captures, which arrive as bytes rather than an existing file on disk).
export async function saveBytes(area, destSub, filename, buffer, contentType) {
  const lib = requireLib(await getLibrary(area))
  const name = String(filename || 'capture.png').replace(/[\\/]+/g, '-')
  const ct = contentType || mimeForName(name)
  const fsub = folderSub(destSub)
  if (lib.mode === 'local') {
    const destDir = join(lib.localPath, fsub)
    await mkdir(destDir, { recursive: true })
    await writeFile(join(destDir, name), buffer)
    return { ok: true, sub: fsub + name }
  }
  const { c, cfg } = await resolveClient()
  await c.send(
    new PutObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + fsub + name, Body: buffer, ContentType: ct })
  )
  return { ok: true, sub: fsub + name }
}

// Item counts for the sidebar badges: total across the library, items at the
// top level, and items inside each top-level group (recursive within a group).
export async function libraryCounts(area) {
  const lib = requireLib(await getLibrary(area))
  const out = { total: 0, root: 0, groups: {} }

  if (lib.mode === 'local') {
    async function countDir(dir) {
      let n = 0
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return 0
      }
      for (const e of entries) {
        if (e.isFile() && IMAGE_RE.test(e.name)) n++
        else if (e.isDirectory() && !e.name.startsWith('.')) n += await countDir(join(dir, e.name))
      }
      return n
    }
    let entries = []
    try {
      entries = await readdir(lib.localPath, { withFileTypes: true })
    } catch {
      return out
    }
    for (const e of entries) {
      if (e.isFile() && IMAGE_RE.test(e.name)) out.root++
      else if (e.isDirectory() && !e.name.startsWith('.')) {
        out.groups[e.name] = await countDir(join(lib.localPath, e.name))
      }
    }
    out.total = out.root + Object.values(out.groups).reduce((a, b) => a + b, 0)
    return out
  }

  // R2: walk the whole prefix once and bucket keys by their first path segment.
  const { c, cfg } = await resolveClient()
  const base = r2Base(lib)
  let token
  let pages = 0
  do {
    const res = await c.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: base, ContinuationToken: token })
    )
    for (const o of res.Contents || []) {
      if (!IMAGE_RE.test(o.Key)) continue
      const rest = o.Key.slice(base.length)
      const slash = rest.indexOf('/')
      if (slash < 0) out.root++
      else {
        const g = rest.slice(0, slash)
        out.groups[g] = (out.groups[g] || 0) + 1
      }
      out.total++
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token && ++pages < 20) // safety cap ~20k objects
  return out
}

// Rename an item, keeping its folder and original extension. Returns the new sub.
export async function libraryRename(area, fileSub, newName) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(fileSub || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const slash = clean.lastIndexOf('/')
  const dir = slash >= 0 ? clean.slice(0, slash + 1) : ''
  const ext = extname(clean)
  let base = String(newName || '').replace(/[\\/<>:"|?*]+/g, ' ').trim()
  if (!base) return clean
  if (base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, base.length - ext.length)
  const newSub = dir + base + ext
  if (newSub === clean) return clean

  if (lib.mode === 'local') {
    await rename(join(lib.localPath, clean), join(lib.localPath, newSub))
    return newSub
  }
  const { c, cfg } = await resolveClient()
  await c.send(
    new CopyObjectCommand({
      Bucket: cfg.bucket,
      CopySource: encodeURI(`${cfg.bucket}/${r2Base(lib) + clean}`),
      Key: r2Base(lib) + newSub
    })
  )
  await c.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + clean }))
  return newSub
}

export async function libraryRemove(area, fileSub) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(fileSub || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (lib.mode === 'local') {
    await shell.trashItem(join(lib.localPath, clean)) // Recycle Bin, recoverable
    return true
  }
  const { c, cfg } = await resolveClient()
  await c.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: r2Base(lib) + clean }))
  return true
}

export async function removeGroupFolder(area, name) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(name || '').replace(/[\\/]+/g, '-').trim()
  if (!clean) return false
  if (lib.mode === 'local') {
    try {
      await shell.trashItem(join(lib.localPath, clean)) // whole folder → Recycle Bin
    } catch {
      /* folder may not exist yet */
    }
    return true
  }
  // R2: delete every object under the group's prefix.
  const { c, cfg } = await resolveClient()
  const prefix = r2Base(lib) + clean + '/'
  let token
  do {
    const out = await c.send(
      new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token })
    )
    for (const obj of out.Contents || []) {
      await c.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: obj.Key }))
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return true
}

export async function createGroup(area, name) {
  const lib = requireLib(await getLibrary(area))
  const clean = String(name || '').replace(/[\\/]+/g, '-').trim()
  if (!clean) return false
  if (lib.mode === 'local') await mkdir(join(lib.localPath, clean), { recursive: true })
  // R2 has no real empty folders — the group appears once something is imported.
  return true
}

export { IMAGE_RE }
