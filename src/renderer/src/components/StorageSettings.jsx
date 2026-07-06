import { useEffect, useState } from 'react'

const PROVIDERS = {
  r2: {
    label: 'Cloudflare R2',
    region: 'auto',
    endpointHint: 'https://<account-id>.r2.cloudflarestorage.com'
  },
  wasabi: {
    label: 'Wasabi',
    region: 'us-east-1',
    endpointHint: 'https://s3.us-east-1.wasabisys.com'
  },
  custom: { label: 'Other S3-compatible', region: 'us-east-1', endpointHint: 'https://…' }
}

const EMPTY = {
  provider: 'r2',
  endpoint: '',
  region: 'auto',
  accessKeyId: '',
  secretAccessKey: '',
  bucket: ''
}

export default function StorageSettings({ onClose }) {
  const [cfg, setCfg] = useState(EMPTY)
  const [status, setStatus] = useState(null) // { ok, msg }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api?.storage?.getConfig().then((c) => c && setCfg({ ...EMPTY, ...c }))
  }, [])

  function set(field, value) {
    setCfg((c) => ({ ...c, [field]: value }))
    setStatus(null)
  }

  function pickProvider(p) {
    setCfg((c) => ({ ...c, provider: p, region: PROVIDERS[p].region }))
    setStatus(null)
  }

  async function save() {
    await window.api.storage.setConfig(cfg)
    setStatus({ ok: true, msg: 'Saved.' })
  }

  async function testConnection() {
    setBusy(true)
    setStatus(null)
    try {
      await window.api.storage.setConfig(cfg)
      await window.api.storage.test()
      setStatus({ ok: true, msg: 'Connected — bucket reachable.' })
    } catch (e) {
      setStatus({ ok: false, msg: e?.message || 'Connection failed.' })
    } finally {
      setBusy(false)
    }
  }

  const hint = PROVIDERS[cfg.provider]?.endpointHint

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Storage settings</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="modal-sub">
          Connect an S3-compatible bucket. Works with Cloudflare R2, Wasabi, and others.
        </p>

        <label className="field">
          <span>Provider</span>
          <div className="provider-row">
            {Object.entries(PROVIDERS).map(([key, p]) => (
              <button
                key={key}
                className={`provider-btn ${cfg.provider === key ? 'active' : ''}`}
                onClick={() => pickProvider(key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </label>

        <label className="field">
          <span>Endpoint</span>
          <input
            value={cfg.endpoint}
            placeholder={hint}
            onChange={(e) => set('endpoint', e.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Bucket</span>
            <input value={cfg.bucket} onChange={(e) => set('bucket', e.target.value)} />
          </label>
          <label className="field">
            <span>Region</span>
            <input value={cfg.region} onChange={(e) => set('region', e.target.value)} />
          </label>
        </div>

        <label className="field">
          <span>Access Key ID</span>
          <input value={cfg.accessKeyId} onChange={(e) => set('accessKeyId', e.target.value)} />
        </label>

        <label className="field">
          <span>Secret Access Key</span>
          <input
            type="password"
            value={cfg.secretAccessKey}
            onChange={(e) => set('secretAccessKey', e.target.value)}
          />
        </label>

        {status && (
          <div className={`status ${status.ok ? 'ok' : 'err'}`}>{status.msg}</div>
        )}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={testConnection} disabled={busy}>
            {busy ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
