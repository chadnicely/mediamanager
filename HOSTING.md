# Sniddy — Tech Stack & Hosting Reference

**Last updated:** 2026-07-06

---

## Repository

**There is no repository.** Sniddy has never been put under git — no local repo, no GitHub, no backup copy anywhere except this folder on this machine:

```
C:\Users\chad\Antigravity\gcc-frontend\Evernote\
```

If this project needs to move to another machine or be handed to another developer/AI session, **the entire folder must be copied as-is** (minus `node_modules`, which can be reinstalled with `npm install`). There is no version history to fall back on.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop app framework | Electron (via `electron-vite`) |
| UI | React 18 + Vite |
| Styling | Plain CSS, one file (`src/renderer/src/styles.css`) |
| Desktop packaging | `electron-builder` (`npm run build:win` → Windows `.exe`) |
| Object storage (per-user) | Cloudflare R2 or any S3-compatible bucket (Wasabi, etc.) — via `@aws-sdk/client-s3` |
| Local storage alternative | Plain filesystem folders (no bucket required) |
| Auth backend | Node.js + Express + Mongoose |
| Auth database | MongoDB (Atlas-hosted, see below) |
| Password hashing | bcryptjs |
| Session tokens | JWT (jsonwebtoken) |
| Screenshot sharing | Cloudflare Worker + R2 bucket (separate from user buckets — Sniddy-owned) |
| Browser capture | Chrome Extension, Manifest V3 (unpacked / not published) |

---

## Services & Where They Run

| Service | Where it runs today | Notes |
|---|---|---|
| Sniddy desktop app | User's PC (Electron) | Not distributed — dev-mode only (`npm run dev`) |
| Auth API (`server/`) | User's PC, port **4500** | **Not publicly hosted.** Must be deployed somewhere (Render/Railway/Fly.io/VPS) before the app can be given to other users — right now only works on this one machine. |
| Extension → app bridge (`receiver.js`) | User's PC, port **47600** | Loopback only, not exposed to the internet. Chrome extension talks to it directly. |
| Screenshot share relay | **Cloudflare Workers** (already deployed) | URL: `https://jotter-share.chad-nicely.workers.dev` — see Cloudflare account below |
| Auth database | **MongoDB Atlas** (already provisioned) | See connection details below |

---

## Database

**Provider:** MongoDB Atlas
**Cluster:** `globalcontrol.cyk55dk.mongodb.net`
**Database name:** `mediamanager`
**Used by:** `server/index.js` (the auth API) — stores user accounts only (email + bcrypt password hash). No notes/images/files are stored here; those live in the user's own storage (local or R2).

The live connection string (including the password) is stored in:
```
Evernote\server\.env   →  MONGODB_URI=
```
This file is gitignored and was **deliberately not duplicated into this document** — see the note at the bottom. Open it directly on this machine if you need the value.

The same `.env` file also holds `JWT_SECRET` (a random signing key for login tokens) and `PORT` (4500).

---

## Cloudflare Account (screenshot sharing)

- **Worker:** `jotter-share`, deployed to `https://jotter-share.chad-nicely.workers.dev`
- **R2 bucket:** `shotshosted` — bound to the Worker as `env.BUCKET`
- **Source:** `Evernote\share-worker\` (`worker.js`, `wrangler.toml`, `README.md`)
- **Redeploy command:** `cd share-worker && npx wrangler deploy` (requires `npx wrangler login` once per machine)
- **Outstanding:** the bucket needs a lifecycle rule (delete objects under `shared/` after 7 days) set manually in the Cloudflare dashboard — confirm this has been done.

This is separate and unrelated to any R2 bucket an individual Sniddy *user* connects in Settings — those are the user's own buckets/credentials, stored locally in `storage-config.json` (Electron userData folder), never sent anywhere except directly to that user's bucket.

---

## A note on why the live secrets aren't copied into this file

This document is written to be handed off or shared (e.g. to another developer or AI session). The actual database password and any R2 access keys are **live production credentials** — copying them into a portable document multiplies how many places they exist and how easily they could leak. They're already stored correctly in `server/.env` (gitignored) and in Electron's local config files, which is where an app/session that actually needs to run the code should read them from directly.

**If you specifically want the raw connection string and keys written into a file for transfer, say so explicitly** and I'll do it — this is a judgment call about your own security posture, not a hard restriction. If you'd rather share it more safely, consider a password manager's secure note/share feature instead of a plain document.
