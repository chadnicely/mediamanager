// POST /api/auth/login  { email, password } -> { token, user }
import { json, cors, verifyPassword, getSecret, signJwt } from '../_lib_auth.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() })
}

export async function onRequestPost({ request, env }) {
  try {
    const { email, password } = await request.json()
    const em = String(email || '').toLowerCase().trim()
    const pw = String(password || '')
    const user = await env.DB.prepare(
      'SELECT id, email, pw_hash, pw_salt FROM users WHERE email=?'
    )
      .bind(em)
      .first()
    if (!user || !(await verifyPassword(pw, user.pw_salt, user.pw_hash))) {
      return json({ error: 'Invalid email or password.' }, 401)
    }
    const token = await signJwt({ uid: user.id, email: user.email }, await getSecret(env))
    return json({ token, user: { email: user.email } })
  } catch (e) {
    return json({ error: e.message || 'Login failed.' }, 500)
  }
}
