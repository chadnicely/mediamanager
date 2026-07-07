// Generates a real thumbnail IMAGE for a video by decoding one frame off-screen
// and drawing it to a canvas. Unlike a live <video> tile, the result is a stable
// image that always paints. Jobs run through a small queue (a few at a time) so
// we take our time and never overload the video decoder — the first tiles
// requested (the first page) are generated first.

const cache = new Map() // url -> { thumb, duration }
const inflight = new Map() // url -> Promise
const queue = []
let active = 0
const MAX_CONCURRENT = 4
const TIMEOUT_MS = 15000
const SEEK_FRACTION = 0.1 // land ~10% in to skip a black intro
const SEEK_MAX = 1.5
const MAX_WIDTH = 480 // downscale — plenty for a grid tile

export function getVideoThumb(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url))
  if (inflight.has(url)) return inflight.get(url)
  const p = new Promise((resolve) => {
    queue.push({ url, resolve })
    pump()
  })
  inflight.set(url, p)
  return p
}

// Perceptual fingerprint (dHash) of the video's frame, for visual duplicate
// detection — computed from the same decoded frame as the thumbnail, so it's
// free once the thumbnail exists.
export function getVideoHash(url) {
  return getVideoThumb(url).then((res) => res?.hash || null)
}

function bitsToHex(bits) {
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

// dHash: shrink the frame to 9x8 grayscale, then per row encode whether each
// pixel is brighter than its right neighbour → 64-bit fingerprint.
function frameHash(video) {
  try {
    const cv = document.createElement('canvas')
    cv.width = 9
    cv.height = 8
    const ctx = cv.getContext('2d')
    ctx.drawImage(video, 0, 0, 9, 8)
    const { data } = ctx.getImageData(0, 0, 9, 8)
    const gray = []
    for (let i = 0; i < 9 * 8; i++) {
      gray.push(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2])
    }
    let bits = ''
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0'
      }
    }
    return bitsToHex(bits)
  } catch {
    return null
  }
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()
    active++
    generate(job.url)
      .then((res) => {
        if (res) cache.set(job.url, res)
        inflight.delete(job.url)
        job.resolve(res)
      })
      .finally(() => {
        active--
        pump()
      })
  }
}

function generate(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.playsInline = true

    let settled = false
    const timer = setTimeout(() => finish(null), TIMEOUT_MS)

    function finish(res) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        v.removeAttribute('src')
        v.load()
      } catch {
        /* ignore */
      }
      resolve(res)
    }

    function capture() {
      const w = v.videoWidth
      const h = v.videoHeight
      if (!w || !h) return finish(null)
      try {
        const scale = Math.min(1, MAX_WIDTH / w)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(w * scale))
        canvas.height = Math.max(1, Math.round(h * scale))
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
        const thumb = canvas.toDataURL('image/jpeg', 0.8)
        const hash = frameHash(v)
        finish({ thumb, duration: isFinite(v.duration) ? v.duration : 0, hash })
      } catch {
        finish(null) // tainted canvas / draw failure — caller falls back
      }
    }

    v.addEventListener('loadeddata', () => {
      const t = Math.min((v.duration || 4) * SEEK_FRACTION, SEEK_MAX)
      try {
        v.currentTime = t > 0 ? t : 0.1
      } catch {
        capture()
      }
    })
    v.addEventListener('seeked', capture)
    v.addEventListener('error', () => finish(null))

    v.src = url
  })
}
