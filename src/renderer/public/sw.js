// Sniddy PWA service worker — offline app shell.
// - Navigations (the HTML document) are network-first, so a redeploy shows up
//   on the next open instead of being pinned to a stale cached shell.
// - Hashed build assets (/assets/*) are immutable, so cache-first is safe.
// - API/auth traffic is never cached.

const CACHE = 'sniddy-shell-v2'
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never cache API/auth traffic.
  if (url.pathname.startsWith('/api/')) return
  if (url.origin !== self.location.origin) return

  // The page shell: network-first so a new deploy wins; fall back to cache offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    )
    return
  }

  // Everything else (hashed assets, icons): cache-first, backfill on miss.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
    )
  )
})
