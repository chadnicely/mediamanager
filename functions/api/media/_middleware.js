// Gate for all /api/media/* routes. Sniddy's web app has no user accounts yet,
// so a shared key (Pages secret MEDIA_KEY, also baked into the client build)
// keeps the media API from being wide open to anyone who finds the URL.
// NOTE: the key ships in client JS, so this deters casual access, not a
// determined attacker — real protection needs per-user auth. See onboarding.

const AREAS = ['images', 'videos', 'files', 'screenshots']

export async function onRequest(context) {
  const { request, env, next } = context

  // CORS preflight (harmless; the app is same-origin but this keeps it flexible).
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() })
  }

  // If a key is configured, require it. If MEDIA_KEY is unset, allow (dev).
  const need = env.MEDIA_KEY
  if (need) {
    const got =
      request.headers.get('x-sniddy-key') ||
      new URL(request.url).searchParams.get('k') ||
      ''
    if (got !== need) {
      return json({ error: 'unauthorized' }, 401)
    }
  }

  const res = await next()
  // Attach CORS headers to whatever the route returns.
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors())) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

export function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-sniddy-key'
  }
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

export { AREAS }
