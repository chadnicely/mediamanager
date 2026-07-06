# Jotter — Project Handoff

**Last updated:** 2026-07-06
**Location:** `gcc-frontend/Evernote/` (folder is literally named `Evernote` — that's a leftover from the original idea, the product is called **Jotter**)
**Status:** Not under git / version control. No repository exists anywhere (local or GitHub). Everything lives as files on the original machine.

---

## 1. What Jotter Is

A Windows desktop app (Electron + React + Vite) that started as an Evernote clone and grew into a **5-area capture/organize suite**:

| Area | Icon | What it does |
|---|---|---|
| **Notes** | 📝 | Evernote-style notes: notebooks/groups, rich-text editor, search, favorites |
| **Files** | 📁 | Document/audio/design/archive library with folders |
| **Images** | 🖼 | FastStone-style image gallery with thumbnails, lightbox |
| **Videos** | 🎬 | Same browser pattern as Files, video-focused |
| **Shots** | 📸 | Screenshot capture + management (the most-developed area) |

Plus a **Chrome extension** ("Jotter Capture") for web-page screenshots, and a **Cloudflare Worker** for sharing screenshots via public links.

**User (Chad) is non-technical** — communicates in plain language, wants things "super fast," reacts strongly to visual/UX issues, and needs iterative back-and-forth with live verification (screenshots, running the app) rather than being told something works.

---

## 2. Architecture

```
Evernote/
├── src/
│   ├── main/           — Electron main process (Node.js side)
│   │   ├── index.js    — window creation, ALL ipcMain handlers, Print Screen capture flow
│   │   ├── storage.js  — S3/R2 adapter + local-folder adapter (dual backend)
│   │   └── receiver.js — tiny HTTP server on :47600 for the Chrome extension
│   ├── preload/
│   │   └── index.js    — contextBridge exposing `window.api` to the renderer
│   └── renderer/src/
│       ├── App.jsx           — app shell, auth gate, area router, rail nav
│       ├── areas/            — one file per left-rail section (Notes/Files/Images/Videos/Screenshots)
│       ├── components/       — shared UI (AreaLayout, ScanImport, ImageGallery, LibraryBrowser, Lightbox, icons, etc.)
│       ├── lib/               — client-side helpers (auth, favorites, groups, storage helpers, share, thumbSize)
│       └── styles.css         — ALL styling lives in this one file (huge, append at bottom of relevant section)
├── chrome-extension/    — MV3 extension, load unpacked at chrome://extensions
├── share-worker/        — Cloudflare Worker (screenshot hosting/sharing)
├── server/              — Express + MongoDB auth backend (accounts/login)
└── HANDOFF.md           — this file
```

**Run the app (dev):**
```
cd Evernote
npm run dev          # starts electron-vite, opens the Jotter window
```
**Build:**
```
npm run build         # renderer + main + preload build (does NOT restart Electron)
```
Main-process changes (anything in `src/main/`) require killing and restarting `npm run dev` — hot reload only covers the renderer.

**Run the auth server (separate terminal):**
```
cd Evernote/server
npm start             # listens on :4500
```

**IMPORTANT PORT RULE (from user's global memory):** frontend dev servers in this user's other projects use :4000, demo backend :3011 — **never use :3000** for anything. Jotter's own ports are :4500 (auth API) and :47600 (Chrome extension receiver) — those are fine, just don't reassign other services to :3000.

---

## 3. Storage Model (core concept — read this first)

Each of Files/Images/Videos/Shots has an independent "library" that is **either**:
- **A local folder** on the user's PC, or
- **An R2/S3-compatible bucket** (Cloudflare R2, Wasabi, etc.) — user enters endpoint/keys/bucket in Settings

A **"group"** = a subfolder (local) or a prefix (R2). The first area the user configures is asked "local or online storage?"; every other area **auto-inherits** the same choice (sibling folder locally, or an area-named prefix in the same bucket) via `storage.ensureLibrary()` in `src/main/storage.js`. `LIBRARY_AREAS` constant lists which areas participate in this auto-inherit — currently `['images','videos','files','screenshots']`.

Config file: `libraries.json` in Electron's userData folder (per-area `{mode, localPath}` or `{mode, prefix}`).
R2 credentials: `storage-config.json` in userData (`storage.getConfig/setConfig`).

**Thumbnails:** every image/video preview goes through a **cached native-image thumbnail generator** in `src/main/index.js` (`getThumb()`), keyed by path+mtime, cached to disk in userData/`thumb-cache`. Access via `jotter-media://f/?p=<path>&t=<size>`. This was critical for performance — loading full multi-MB files for tiny thumbnails made everything unusably slow before this was added.

**Perceptual hashing (duplicate detection):** `imageHash()` in `src/main/index.js` computes a dHash (9×8 grayscale grid → 64-bit fingerprint) for visual duplicate matching in the Scan/Images area. Degenerate (near-solid-color) hashes are excluded to avoid false positives; match threshold is tight (3 bits) after the user complained about over-matching.

---

## 4. Screenshots (Shots) — the deepest feature

This area got the most iteration. Current state:

- **Full-width thumbnail grid** (not the old strip+preview split) with a size slider (persisted per-area via `lib/thumbSize.js`)
- **Click a shot → right-side detail drawer** slides in (not the old inline preview) with rename-inline, Favorite/Copy/Download/Share/Delete
- **Hover a tile → quick action icons** appear (favorite/download/share/delete) using shared SVG icons from `components/icons.jsx`
- **Sidebar group counts** — every nav item and group shows an item count (`storage.libraryCounts()`)
- **Media vs Folders view toggle** in Images/Files/Videos (persisted per-area) — Images defaults to media-only, Files/Videos default to folders view

### Capture sources (three independent paths, all feed the same Shots library):
1. **In-app "Capture screen" button** — simple, saves directly
2. **Chrome extension** (see §5)
3. **Windows Print Screen key** (see §6) — the newest and most elaborate

### Sharing
- **🔗 Share link** button/menu on shots offers two choices:
  - **"Get a shareable link"** — uploads to the Cloudflare Worker (`share-worker/`), returns a link that auto-expires in 7 days (max S3 presign lifetime). Uses `lib/share.js` → `hostedShareLink()`. Worker URL is hardcoded: `https://jotter-share.chad-nicely.workers.dev`
  - **"Use my own R2 bucket"** — `storage.shareLink()` presigns a URL from the user's own bucket (uploads a copy under `shared/` first if the item is local)
- The Worker itself (`share-worker/worker.js`) serves a **branded HTML viewer page** (not a raw image link) — dark theme, Jotter logo, Download button, Copy-link toast, OG meta tags for link previews. Deployed via `npx wrangler deploy` from `share-worker/`. R2 bucket name: `shotshosted`. **User must set a 7-day lifecycle rule on the bucket manually** (Cloudflare dashboard → R2 → bucket → Settings → Object lifecycle rules → prefix `shared/` → Delete after 7 days) — this was NOT done as of last check, confirm with user.

---

## 5. Chrome Extension ("Jotter Capture")

Location: `chrome-extension/` — MV3, loaded unpacked (not published to the Web Store).

**Capture modes** (from the toolbar popup, or keyboard shortcuts Ctrl+Shift+1/2/3, or Ctrl+Shift+4 for a slide-down in-page capture bar):
- **Visible area** — `chrome.tabs.captureVisibleTab`
- **Full page** — primary method uses `chrome.debugger` CDP (`Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot` with `captureBeyondViewport`) for a true one-shot whole-page capture (this was essential — naive scroll+stitch missed content or only got the viewport on many sites). Falls back to a scroll-and-stitch approach that **detects the actual scrolling element** (handles pages where an inner `<div>` scrolls, not `document`) if CDP fails.
- **Select area / Region** — injects `region.js`: crosshair overlay, resizable/movable selection box with handles, live W×H readout, "spotlight" dim effect outside the box. Toolbar has Capture/Redo/Cancel.

**Post-capture flow (critical UX decision — nothing auto-saves):**
- Shutter sound plays via an **offscreen document** (`offscreen.html/js`) — necessary because normal in-page `<audio>` is blocked by browser autoplay policy on pages the user hasn't interacted with; offscreen extension pages are exempt. Sound is a hand-synthesized WAV (`shutter.wav`) — dry, light "tk-tk" mechanical click (went through several iterations: too deep → too explosion-y → too quiet → landed on this).
- A **result card** is injected into the page (bottom-right) via `resultCard()` in `background.js`. Shows the screenshot, title says "not saved yet," and offers exactly: **Save / Share / Save+Share** (main row) plus **✏️ Edit** and **🗑 Discard** (top-right icons) — 3+2 buttons total per explicit user request ("only 3 buttons" for the main actions).
- **Edit** opens a full annotator inside the card: Pen, Highlight, Box, Circle, Arrow, Text, numbered Step badges, Blur (pixelate — for redacting sensitive info), Crop, 6 colors, Undo. Apply returns to the card without auto-saving (user still chooses Save/Share after).
- **Save** posts to the local receiver (`src/main/receiver.js` on `127.0.0.1:47600`, POST /shots, DELETE /shots?sub=, supports a `replaceSub` field so re-saving after an edit overwrites the earlier version instead of duplicating). If Jotter isn't running, falls back to `chrome.downloads`.
- **Download** button also present — writes straight to disk without touching Jotter at all (added because "sometimes the file is all you want").

---

## 6. Print Screen (desktop-native capture)

This was built because the user wanted OS-level Print Screen to open Jotter's capture flow, Jing-style.

**In `src/main/index.js`:**
- `globalShortcut.register('PrintScreen', ...)` — **this only works if no other app has claimed the key.** Snagit was intercepting it on the user's machine; had to be uninstalled. If registration fails, there's a **clipboard-watcher fallback** (`setInterval` polling `clipboard.readImage()`, seeded with a hash of whatever's on the clipboard at startup so an old screenshot isn't re-imported, only accepts images whose size matches a display or the multi-monitor bounding box).
- Pressing Print Screen **does not blindly capture** — it opens a **full-screen crosshair overlay** (frozen screenshot of the display under the cursor, dims outside the drag box, live size readout, "Enter = whole screen / Esc = cancel" hint pill). This was iterated from an earlier "chooser pill" design the user rejected as "not sexy."
- After a region is selected, the **same style of decision card** as the extension opens (bottom-right, draggable/resizable via `cardBounds()`, `openCaptureCard()`) with **Download / Save / Share / Save+Share** + edit/discard icons. The card's HTML/JS is inlined as a template string in `index.js` (`buildCardHtml()`) — it's a full copy of the extension's annotator logic, kept in vanilla JS since it loads via `loadURL('data:text/html...')` in a frameless BrowserWindow, not through the Vite pipeline.
- `app.setAppUserModelId(...)` is required on Windows for `Notification` to actually display — this was a real bug (notifications silently didn't work without it).
- A shutter sound plays via the **main Jotter window itself** on the `shots:captured` IPC event (renderer plays `src/renderer/src/assets/shutter.wav` — a copy of the same file bundled into the Vite build) since a global keypress has no "page" to inject audio into.

**Known limitation the user was told directly:** Full-page scrolling capture is impossible from the Print Screen path — Windows doesn't let one app drive another app's scroll position. Full-page capture only exists in the Chrome extension, where the extension can control the page it's capturing.

---

## 7. Accounts / Database

- Backend: `server/` — Express + Mongoose + bcryptjs + JWT. Routes: `/api/health`, `/api/auth/signup`, `/api/auth/login`, `/api/me`.
- **As of 2026-07-05, wired to MongoDB Atlas** (cluster `globalcontrol.cyk55dk.mongodb.net`, db `mediamanager`). Connection string + a freshly-generated `JWT_SECRET` live in `server/.env` (gitignored — **do not print or commit this file**). Previously used a local MongoDB (`127.0.0.1:27017/jotter`); that data was NOT migrated, so the user's old local account no longer exists in Atlas — they'll need to sign up again.
- The auth server (`server/`) still needs to be **hosted somewhere public** before the app can be distributed to other users (right now it only runs on the original dev machine, :4500). This is an open TODO.
- Electron main talks to it via `src/renderer/src/lib/auth.js` — check that file for the base URL (may be hardcoded to localhost).

---

## 8. Storage & Sharing Credentials Note

`server/.env` and any `storage-config.json` in userData contain real secrets (Mongo password, R2 keys). **Never paste these into chat, commit them to git, or write them into a shareable doc.** If a new session needs them, read the files directly on the user's machine — don't ask the user to retype secrets into the conversation.

---

## 9. No Version Control (important context)

**This project has never been under git.** No local repo, no GitHub remote. This has caused real pain: the user asked multiple times to "roll back to last night" and there was nothing to roll back to — every fix had to be done by re-editing forward. If a new session has the opportunity, **strongly recommend `git init` + a `.gitignore`** (exclude `node_modules`, `dist`, `out`, `.env`, `thumb-cache`, any `*.log`) as an early priority, framed to the user as "so I can actually undo things when you ask."

---

## 10. Open / Pending Items

- [ ] R2 bucket `shotshosted` needs its 7-day object-lifecycle rule set in the Cloudflare dashboard (not yet confirmed done)
- [ ] Auth server (`server/`) needs public hosting before the app can be given to other users
- [ ] No git repository exists — recommend setting one up
- [ ] User's old local-Mongo account was not migrated to Atlas — they need to re-signup
- [ ] Duplicate-finder in Scan (perceptual hash) works but threshold was tuned once based on one complaint — may need further tuning if false positives/negatives recur
- [ ] "Media vs Folders" toggle and thumbnail-size slider exist on Images/Files/Videos but NOT on Notes (user asked for it across "Notes, Files, Images, Videos, Shots" but Notes has no thumbnail concept — this was flagged to the user as a mismatch, unresolved)
- [ ] Chrome extension is unpacked/local-only — not published, has no auto-update mechanism

---

## 11. Working Style Notes (for whoever picks this up)

- **User is highly reactive and iterative.** Expect rapid back-and-forth, strong reactions to anything visually "not sexy" or slow, and requests to redo things multiple times (see: the Print Screen chooser going from pill → crosshairs-only after one round of feedback).
- **Always verify visually when possible.** This user cannot be told "it's fixed" without seeing it — screenshots, running the dev server, and describing exactly what changed are expected every time.
- **Electron main-process changes require an app restart** (kill electron.exe, `npm run dev` again) — renderer-only changes hot-reload. Get in the habit of checking which layer you edited.
- **Don't repoint shared resources (like a library's storage location) without being very sure** — a prior session pointed the Images library at the user's Downloads folder without fully thinking through the consequences (it pulled in unrelated personal folders as "groups"), which caused a distressed reaction and had to be reverted. Treat storage-location changes as high-stakes.
- **No comments/over-engineering** — keep changes minimal and match existing code style (plain functions, inline styles in the injected HTML templates, one big `styles.css`).
