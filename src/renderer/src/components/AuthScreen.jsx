import { useState } from 'react'
import { login, signup, apiBase, setApiBase } from '../lib/auth.js'

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showApi, setShowApi] = useState(false)
  const [api, setApi] = useState(apiBase())

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = mode === 'login' ? await login(email, password) : await signup(email, password)
      onAuthed(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="auth-logo">J</div>
          <div className="auth-title">Jotter</div>
        </div>

        <h1 className="auth-h1">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Log in to your notes, files, images and screenshots.'
            : 'One account for notes, files, images and screenshots.'}
        </p>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            autoFocus
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
          />
        </label>

        {error && <div className="status err">{error}</div>}

        <button className="btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <div className="auth-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('login')}>
                Log in
              </button>
            </>
          )}
        </div>

        <div className="auth-api">
          <button type="button" className="link-btn tiny" onClick={() => setShowApi((s) => !s)}>
            {showApi ? 'Hide' : 'Server settings'}
          </button>
          {showApi && (
            <div className="auth-api-row">
              <input
                value={api}
                onChange={(e) => setApi(e.target.value)}
                placeholder="http://localhost:4500"
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setApiBase(api)
                  setError('')
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
