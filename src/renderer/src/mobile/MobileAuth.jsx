import { useState } from 'react'
import { login, signup } from '../lib/auth.js'

// Full-screen sign-in / create-account sheet for the mobile app. On success it
// hands the user back up so the app can sync to the account.
export default function MobileAuth({ onAuthed, onClose }) {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = mode === 'login' ? await login(email, password) : await signup(email, password)
      onAuthed(user)
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="m-auth">
      <div className="m-auth-card">
        <div className="m-auth-logo">S</div>
        <h1 className="m-auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="m-auth-sub">Sign in to sync your notes across all your devices.</p>

        <form onSubmit={submit} className="m-auth-form">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <div className="m-auth-err">{error}</div>}
          <button className="m-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>

        <button
          className="m-auth-switch"
          onClick={() => {
            setError('')
            setMode(mode === 'login' ? 'signup' : 'login')
          }}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
        </button>

        {onClose && (
          <button className="m-auth-later" onClick={onClose}>
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
