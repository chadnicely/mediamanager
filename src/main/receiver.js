// Tiny loopback HTTP server so the Jotter Chrome extension can hand off
// captured screenshots. Binds to 127.0.0.1 only. Requests are accepted from
// chrome-extension:// origins (the extension) and refused otherwise, so a
// random web page can't quietly drop files into the user's Shots.
import { createServer } from 'http'
import * as storage from './storage.js'

const PORT = 47600
const AREA = 'screenshots'

function allowOrigin(origin) {
  return typeof origin === 'string' && origin.startsWith('chrome-extension://')
}

function cors(res, origin) {
  if (allowOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function readBody(req, limitBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > limitBytes) {
        reject(new Error('Capture too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Parse "data:image/png;base64,AAAA" into { buffer, contentType }.
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(String(dataUrl || ''))
  if (!m) throw new Error('Not a data URL')
  const contentType = m[1] || 'image/png'
  const buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]))
  return { buffer, contentType }
}

function extFor(ct) {
  if (ct === 'image/jpeg') return 'jpg'
  if (ct === 'image/webp') return 'webp'
  return 'png'
}

function safeGroup(g) {
  return String(g || '').replace(/[\\/]+/g, '-').replace(/[<>:"|?*]/g, '').trim()
}

export function startReceiver() {
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    cors(res, origin)

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Health check the extension uses to detect whether Jotter is running.
    if (req.method === 'GET' && req.url.startsWith('/ping')) {
      send(res, 200, { ok: true, app: 'jotter', area: AREA })
      return
    }

    if (req.method === 'POST' && req.url.startsWith('/shots')) {
      if (!allowOrigin(origin)) {
        send(res, 403, { ok: false, error: 'Forbidden origin' })
        return
      }
      try {
        const raw = await readBody(req)
        const payload = JSON.parse(raw.toString('utf-8'))
        const { buffer, contentType } = decodeDataUrl(payload.dataUrl)

        // Make sure the Shots library exists (inherits location from another area).
        const lib = await storage.ensureLibrary(AREA)
        if (!lib) {
          send(res, 409, {
            ok: false,
            error: 'Set up a storage location in Jotter (any area) before capturing.'
          })
          return
        }

        const stamp = payload.stamp || 'capture'
        const base = String(payload.name || stamp).replace(/[\\/<>:"|?*]+/g, ' ').trim() || 'capture'
        const filename = `${base}.${extFor(contentType)}`
        const group = safeGroup(payload.group)

        const result = await storage.saveBytes(AREA, group, filename, buffer, contentType)
        // Replacing (e.g. saving an edited copy) — drop the old version.
        if (payload.replaceSub && payload.replaceSub !== result.sub) {
          try {
            await storage.libraryRemove(AREA, payload.replaceSub)
          } catch {
            /* old copy may already be gone */
          }
        }
        send(res, 200, { ok: true, saved: result.sub })
      } catch (e) {
        send(res, 500, { ok: false, error: e?.message || 'Save failed' })
      }
      return
    }

    // Remove a capture (sent when the user hits Delete on the result card).
    if (req.method === 'DELETE' && req.url.startsWith('/shots')) {
      if (!allowOrigin(origin)) {
        send(res, 403, { ok: false, error: 'Forbidden origin' })
        return
      }
      try {
        const sub = decodeURIComponent(new URL(req.url, 'http://x').searchParams.get('sub') || '')
        if (!sub) return send(res, 400, { ok: false, error: 'Missing sub' })
        await storage.libraryRemove(AREA, sub)
        send(res, 200, { ok: true })
      } catch (e) {
        send(res, 500, { ok: false, error: e?.message || 'Delete failed' })
      }
      return
    }

    send(res, 404, { ok: false, error: 'Not found' })
  })

  server.on('error', (e) => {
    // Most likely the port is already in use (another Jotter instance). Non-fatal.
    console.error('[receiver] could not start:', e.message)
  })

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[receiver] listening on http://127.0.0.1:${PORT}`)
  })

  return server
}
