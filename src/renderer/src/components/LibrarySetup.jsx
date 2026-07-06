import { useState } from 'react'

// Lets the user choose where an area's library lives: their R2 bucket, or a
// local folder on their drive. Groups become subfolders inside that root.
export default function LibrarySetup({ area, label, onReady }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function useR2() {
    setBusy(true)
    setError('')
    try {
      const cfg = await window.api.storage.getConfig()
      if (!cfg?.endpoint || !cfg?.bucket || !cfg?.accessKeyId || !cfg?.secretAccessKey) {
        setError('Add your R2 / Wasabi details in ⚙️ Settings first, then choose this.')
        return
      }
      await window.api.library.setConfig(area, { mode: 'r2', prefix: `${area}/` })
      onReady()
    } finally {
      setBusy(false)
    }
  }

  async function useLocal() {
    const picks = await window.api.pickFolders()
    if (!picks?.length) return
    await window.api.library.setConfig(area, { mode: 'local', localPath: picks[0] })
    onReady()
  }

  return (
    <div className="area-placeholder">
      <div className="area-placeholder-icon">🗂</div>
      <h2>Where should your new {label} be?</h2>
      <p>A group is a folder. Pick a root — groups become folders inside it.</p>

      <div className="setup-choices">
        <button className="setup-card" onClick={useR2} disabled={busy}>
          <div className="setup-card-icon">☁️</div>
          <div className="setup-card-title">Online Storage</div>
          <div className="setup-card-sub">Store in your R2 / Wasabi bucket — reachable anywhere.</div>
        </button>
        <button className="setup-card" onClick={useLocal}>
          <div className="setup-card-icon">🖥️</div>
          <div className="setup-card-title">Local folder</div>
          <div className="setup-card-sub">Point at a folder on this computer — free & instant.</div>
        </button>
      </div>

      {error && <div className="status err">{error}</div>}
    </div>
  )
}
