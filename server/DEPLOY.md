# Deploying the Sniddy API to Vercel

The `server/` folder is a self-contained Express API that also runs as Vercel
serverless functions. Same code runs locally (`npm start`) and on Vercel.

## Vercel project settings
1. New Project → import the GitHub repo `chadnicely/mediamanager`.
2. **Root Directory: `server`** (important — so Vercel deploys the API, not the desktop app).
3. Framework preset: **Other**. No build step is needed (the API is just functions).
4. Add **Environment Variables** (Production + Preview):
   - `MONGODB_URI` — the Atlas connection string (from `server/.env`)
   - `JWT_SECRET` — the token signing secret (from `server/.env`)
5. Deploy. The API is served under `/api/*`.
6. Point a domain at it (e.g. `api.sniddy.com`) in Vercel → Domains.

## Routes
- `GET  /api/health` — `{ ok, db }`
- `POST /api/auth/signup` · `POST /api/auth/login` · `GET /api/me`
- `POST /api/sync` — notes + notebooks push/pull (auth required)

## Local dev
`cd server && npm install && npm start` → listens on `http://localhost:4500`
(The desktop app also auto-starts this in dev.)

## Notes on the sync endpoint
`POST /api/sync` body: `{ since: <ms>, notes: [...], notebooks: [...] }`.
It upserts the incoming changes (last-write-wins by `updatedAt`), then returns
everything changed on the server since `since`: `{ now, notes, notebooks }`.
Deletes are soft (`deleted: true`) so they propagate to other devices.
