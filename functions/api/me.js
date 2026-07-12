// GET /api/me  (Authorization: Bearer <token>) -> { user }
import { json, cors, getSecret, verifyJwt } from './_lib_auth.js'

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: cors() })
}

export async function onRequestGet({ request, env }) {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return json({ error: 'Not authenticated.' }, 401)
  const payload = await verifyJwt(token, await getSecret(env))
  if (!payload) return json({ error: 'Session expired. Please log in again.' }, 401)
  return json({ user: { email: payload.email } })
}
