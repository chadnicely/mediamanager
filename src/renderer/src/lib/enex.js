// Parse an Evernote .enex export into Sniddy-shaped notes:
//   { title, body (HTML), createdAt, updatedAt }
// Focused on text + formatting. Attachments (<en-media>) are dropped, and a
// count of skipped attachments is reported so nothing is silently lost.

// Evernote timestamps look like 20230115T093000Z.
function tsToMs(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec((s || '').trim())
  if (!m) return Date.now()
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`)
  return isNaN(ms) ? Date.now() : ms
}

// ENML → HTML: unwrap <en-note>, drop attachments, turn checkboxes into glyphs.
function enmlToHtml(content) {
  if (!content) return { html: '', skipped: 0 }
  let html = content
  const wrap = /<en-note[^>]*>([\s\S]*)<\/en-note>/i.exec(html)
  if (wrap) html = wrap[1]

  // Count and remove attachments (images/files) — this is a text-first import.
  const mediaMatches = html.match(/<en-media\b[^>]*(\/>|>[\s\S]*?<\/en-media>)/gi) || []
  const skipped = mediaMatches.length
  html = html.replace(/<en-media\b[^>]*\/>/gi, '')
  html = html.replace(/<en-media\b[^>]*>[\s\S]*?<\/en-media>/gi, '')

  // Evernote checkboxes → simple glyphs the editor can show.
  html = html.replace(/<en-todo[^>]*checked="true"[^>]*\/?>/gi, '☑ ')
  html = html.replace(/<en-todo[^>]*\/?>/gi, '☐ ')

  return { html: html.trim(), skipped }
}

// Returns { notes: [...], skippedAttachments: n, error?: string }
export function parseEnex(text) {
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) {
    return { notes: [], skippedAttachments: 0, error: 'This file isn’t a valid Evernote .enex export.' }
  }
  const notes = []
  let skippedAttachments = 0
  for (const noteEl of doc.getElementsByTagName('note')) {
    const title = (noteEl.getElementsByTagName('title')[0]?.textContent || 'Untitled').trim()
    const contentEl = noteEl.getElementsByTagName('content')[0]
    const { html, skipped } = enmlToHtml(contentEl?.textContent || '')
    skippedAttachments += skipped
    const created = tsToMs(noteEl.getElementsByTagName('created')[0]?.textContent)
    const updatedRaw = noteEl.getElementsByTagName('updated')[0]?.textContent
    const updated = updatedRaw ? tsToMs(updatedRaw) : created
    notes.push({ title: title || 'Untitled', body: html, createdAt: created, updatedAt: updated })
  }
  return { notes, skippedAttachments }
}
