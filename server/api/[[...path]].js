// Vercel serverless entry (catch-all) — hands every /api/* request to the Express
// app. The DB connects lazily inside the app (server/db.js), cached across warm
// invocations. Deploy with Vercel "Root Directory" set to `server`.
import app from '../app.js'

export default app
