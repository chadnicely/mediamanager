// POST /api/auth/signup  { email, password } -> { token, user }
import { json, cors, hashPassword, getSecret, signJwt, newId } from '../_lib_auth.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() })
}

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json()
    const em = String(email || '').toLowerCase().trim()
    const pw = String(password || '')
    if (!em || !pw) return json({ error: 'Email and password required.' }, 400)
    if (pw.length < 6) return json({ error: 'Password must be at least 6 characters.' }, 400)

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(em).first()
    if (existing) return json({ error: 'An account with that email already exists.' }, 409)

    const { hash, salt } = await hashPassword(pw)
    const id = newId()
    await env.DB.prepare(
      'INSERT INTO users (id, email, pw_hash, pw_salt, created_at) VALUES (?,?,?,?,?)'
    )
      .bind(id, em, hash, salt, Date.now())
      .run()

    const token = await signJwt({ uid: id, email: em }, await getSecret(env))
    return json({ token, user: { email: em } })
  } catch (e) {
    return json({ error: e.message || 'Signup failed.' }, 500)
  }
}
