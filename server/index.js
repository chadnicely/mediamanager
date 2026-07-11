import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const PORT = process.env.PORT || 4500
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jotter'
const JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me'

// ---- Model ----
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
)
const User = mongoose.model('User', userSchema)

// ---- App ----
const app = express()
app.use(cors())
app.use(express.json())

function sign(user) {
  return jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, {
    expiresIn: '30d'
  })
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 })
})

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

app.get('/api/me', auth, (req, res) => {
  res.json({ user: { email: req.user.email } })
})

async function start() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB')
  } catch (e) {
    console.error('✗ MongoDB connection failed:', e.message)
    console.error('  The API will start, but auth calls will fail until MongoDB is reachable.')
  }
  app.listen(PORT, () => console.log(`✓ Sniddy API listening on http://localhost:${PORT}`))
}

start()
