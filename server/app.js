import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectDb } from './db.js'
import { User, Note, Notebook } from './models.js'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

// Make sure the DB is connected before any route runs (safe on serverless).
app.use(async (_req, res, next) => {
  try {
    await connectDb()
    next()
  } catch {
    res.status(503).json({ error: 'Database unavailable.' })
  }
})

function sign(user) {
  return jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '30d' })
}

function auth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Not authenticated.' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' })
  }
}

// ---- Health & accounts ----
app.get('/api/health', (_req, res) => res.json({ ok: true, db: true }))

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim()
    const password = String(req.body.password || '')
    if (!email || !password) return res.status(400).json({ error: 'Email and password required.' })
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    if (await User.findOne({ email }))
      return res.status(409).json({ error: 'An account with that email already exists.' })
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({ email, passwordHash })
    res.json({ token: sign(user), user: { email: user.email } })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Signup failed.' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim()
    const password = String(req.body.password || '')
    const user = await User.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password.' })
    res.json({ token: sign(user), user: { email: user.email } })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Login failed.' })
  }
})

app.get('/api/me', auth, (req, res) => res.json({ user: { email: req.user.email } }))

// ---- Notes sync ----
// One endpoint does push + pull: the client sends whatever it changed plus the
// timestamp of its last sync; we upsert those (last-write-wins by updatedAt) and
// return everything on the server that changed since then. Deletes are soft
// (deleted:true) so they propagate to other devices.
function cleanNote(n) {
  return {
    cid: n.cid,
    notebookId: n.notebookId,
    title: n.title,
    body: n.body,
    favorite: n.favorite,
    deleted: n.deleted,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  }
}
function cleanNotebook(n) {
  return { cid: n.cid, name: n.name, deleted: n.deleted, createdAt: n.createdAt, updatedAt: n.updatedAt }
}

async function upsertItem(Model, userId, item, fields) {
  if (!item || !item.cid) return
  const updatedAt = Number(item.updatedAt) || Date.now()
  const data = { updatedAt, createdAt: Number(item.createdAt) || updatedAt }
  for (const f of fields) if (item[f] !== undefined) data[f] = item[f]
  const existing = await Model.findOne({ userId, cid: item.cid })
  if (!existing) {
    await Model.create({ userId, cid: item.cid, ...data })
  } else if (updatedAt >= (existing.updatedAt || 0)) {
    await Model.updateOne({ _id: existing._id }, { $set: data })
  }
  // else: the server copy is newer — keep it; the client gets it on pull.
}

app.post('/api/sync', auth, async (req, res) => {
  try {
    const userId = req.user.uid
    const since = Number(req.body.since) || 0
    const inNotes = Array.isArray(req.body.notes) ? req.body.notes : []
    const inNotebooks = Array.isArray(req.body.notebooks) ? req.body.notebooks : []

    for (const nb of inNotebooks) await upsertItem(Notebook, userId, nb, ['name', 'deleted'])
    for (const n of inNotes)
      await upsertItem(Note, userId, n, ['notebookId', 'title', 'body', 'favorite', 'deleted'])

    const now = Date.now()
    const notes = await Note.find({ userId, updatedAt: { $gt: since } }).lean()
    const notebooks = await Notebook.find({ userId, updatedAt: { $gt: since } }).lean()
    res.json({ now, notes: notes.map(cleanNote), notebooks: notebooks.map(cleanNotebook) })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Sync failed.' })
  }
})

export default app
