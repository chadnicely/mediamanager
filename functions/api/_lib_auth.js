// Shared auth helpers for the Cloudflare Functions (D1-backed accounts).
// Password hashing = PBKDF2 (Web Crypto, native + fast in Workers).
// Sessions = HS256 JWT signed with a secret stored in D1 (never in the repo).

const enc = new TextEncoder()
const dec = new TextDecoder()

export function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization'
  }
}
export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors() }
  })
}

function b64url(bytes) {
  const b = new Uint8Array(bytes)
  let bin = ''
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2)
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16)
  return a
}
export function newId() {
  return hex(crypto.getRandomValues(new Uint8Array(12)))
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits'
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  )
  return { hash: hex(bits), salt: hex(salt) }
}
export async function verifyPassword(password, saltHex, expectedHex) {
  const { hash } = await hashPassword(password, saltHex)
  if (hash.length !== expectedHex.length) return false
  let r = 0
  for (let i = 0; i < hash.length; i++) r |= hash.charCodeAt(i) ^ expectedHex.charCodeAt(i)
  return r === 0
}

export async function getSecret(env) {
  const row = await env.DB.prepare('SELECT value FROM config WHERE key=?').bind('jwt_secret').first()
  return row?.value || 'insecure-fallback-do-not-use'
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ])
}
export async function signJwt(payload, secret) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = b64url(
    enc.encode(JSON.stringify({ ...payload, iat: now, exp: now + 60 * 60 * 24 * 30 }))
  )
  const data = `${header}.${body}`
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return `${data}.${b64url(sig)}`
}
export async function verifyJwt(token, secret) {
  try {
    const [h, p, s] = String(token || '').split('.')
    if (!h || !p || !s) return null
    const key = await hmacKey(secret)
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(s), enc.encode(`${h}.${p}`))
    if (!ok) return null
    const body = JSON.parse(dec.decode(b64urlToBytes(p)))
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null
    return body
  } catch {
    return null
  }
}
