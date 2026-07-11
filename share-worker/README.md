# Sniddy Share Relay

A tiny Cloudflare Worker that hosts shared screenshots in your R2 bucket and
serves them at a short public link. Keeps the bucket private + no keys in the app.

## Deploy (one time)

1. Put your bucket name in `wrangler.toml` (replace `CHANGE-ME-to-your-bucket-name`).
2. From this folder:
   ```
   npx wrangler login        # opens browser, authorize
   npx wrangler deploy
   ```
3. Copy the URL it prints, e.g. `https://jotter-share.<your-subdomain>.workers.dev`.
   Send that URL back — it gets wired into the app.

## Auto-expire after 7 days (one time)

Cloudflare dashboard → R2 → your bucket → **Settings** → **Object lifecycle rules**
→ Add rule: prefix `shared/`, action **Delete**, after **7 days**.

## Endpoints

- `POST /upload`  body `{ "dataUrl": "data:image/png;base64,..." }` → `{ ok, url }`
- `GET  /s/<id>.<ext>` → serves the image (404 once expired)
