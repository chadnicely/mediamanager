import { useRef, useState } from 'react'
import { addGroup, safeName } from '../lib/groups.js'

// Create many groups at once: paste a list (one per line / comma-separated) or
// load a spreadsheet (.csv/.tsv). Screenshots has no bucket folder, so the
// library.createGroup call is best-effort (ignored if there's no library).
export default function BulkGroups({ area, label = 'group', onCreateEach, onClose, onDone }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const names = [...new Set(text.split(/[\n,]/).map((s) => safeName(s)).filter(Boolean))]

  async function loadFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const content = await f.text()
    const cells = content
      .split(/\r?\n/)
      .flatMap((line) => line.split(/[,\t]/))
      .map((s) => s.trim().replace(/^"|"$/g, ''))
      .filter(Boolean)
    setText((prev) => (prev ? prev + '\n' : '') + cells.join('\n'))
  }

  async function create() {
    if (!names.length) return
    setBusy(true)
    for (const n of names) {
      if (onCreateEach) {
        await onCreateEach(n)
      } else {
        addGroup(area, n)
        try {
          await window.api.library.createGroup(area, n)
        } catch {
          /* no library for this area (e.g. screenshots) — name only */
        }
      }
    }
    setBusy(false)
    onDone()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add multiple {label}s</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="modal-sub">
          Paste one {label} name per line (or comma-separated), or load a spreadsheet.
        </p>

        <textarea
          className="bulk-textarea"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Vacation\nReceipts\nClients\nInvoices'}
        />

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          style={{ display: 'none' }}
          onChange={loadFile}
        />

        <div className="modal-actions">
          <button className="btn-ghost" style={{ marginRight: 'auto' }} onClick={() => fileRef.current?.click()}>
            Load spreadsheet…
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={create} disabled={!names.length || busy}>
            {busy ? 'Creating…' : `Create ${names.length || ''} ${label}${names.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
