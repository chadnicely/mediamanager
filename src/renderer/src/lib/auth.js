// Auth + API client. Talks to the Jotter backend (Express + MongoDB).
// The API base is configurable so it can point at localhost in dev or a
// hosted URL in production.

const TOKEN_KEY = 'jotter-token'
const API_KEY = 'jotter-api-base'
const DEFAULT_API = 'http://localhost:4500'

export function apiBase() {
  // Force the local API. A stale saved base was breaking login; ignore it.
  return DEFAULT_API
}
export function setApiBase(url) {
  localStorage.setItem(API_KEY, url)
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const t = getToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  let res
  try {
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new Error('Cannot reach the server. Is the Jotter API running?')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`)
  return data
}

export async function signup(email, password) {
  const data = await request('/api/auth/signup', { method: 'POST', body: { email, password } })
  setToken(data.token)
  return data.user
}

export async function login(email, password) {
  const data = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  setToken(data.token)
  return data.user
}

export async function me() {
  const data = await request('/api/me', { auth: true })
  return data.user
}

export function logout() {
  clearToken()
}
