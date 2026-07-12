// Vercel serverless entry — the Express app handles every route. A rewrite in
// vercel.json funnels all paths here, so /api/auth/login, /api/sync, etc. all
// reach Express (which owns the /api/* routes).
import app from '../app.js'

export default app
