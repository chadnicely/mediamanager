import 'dotenv/config'
import app from './app.js'
import { connectDb } from './db.js'

// Local runner — used in dev (and auto-started by the desktop app). On Vercel the
// app is served through api/index.js instead, so this file isn't used there.
const PORT = process.env.PORT || 4500

connectDb()
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch((e) => console.error('✗ MongoDB connection failed:', e.message))

app.listen(PORT, () => console.log(`✓ Sniddy API listening on http://localhost:${PORT}`))
