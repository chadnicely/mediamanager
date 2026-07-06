import { useEffect, useState } from 'react'
import shutterWav from './assets/shutter.wav'
import NotesApp from './areas/NotesApp.jsx'
import FilesArea from './areas/FilesArea.jsx'
import ImagesArea from './areas/ImagesArea.jsx'
import VideosArea from './areas/VideosArea.jsx'
import ScreenshotsArea from './areas/ScreenshotsArea.jsx'
import StorageSettings from './components/StorageSettings.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import PromptHost from './components/PromptHost.jsx'
import { getToken, me, logout } from './lib/auth.js'

const AREAS = [
  { id: 'notes', icon: '📝', label: 'Notes' },
  { id: 'files', icon: '📁', label: 'Files' },
  { id: 'images', icon: '🖼', label: 'Images' },
  { id: 'videos', icon: '🎬', label: 'Videos' },
  { id: 'screenshots', icon: '📸', label: 'Shots' }
]

export default function App() {
  const [authState, setAuthState] = useState('checking') // checking | anon | authed
  const [user, setUser] = useState(null)
  const [area, setArea] = useState('notes')
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Shutter sound whenever a capture lands (Print Screen etc.) — audible
  // feedback even if the window is minimized.
  useEffect(() => {
    const off = window.api?.onShotsCaptured?.(() => {
      try {
        const a = new Audio(shutterWav)
        a.volume = 0.65
        a.play().catch(() => {})
      } catch {
        /* no audio */
      }
    })
    return () => off?.()
  }, [])

  // On launch, validate any stored token.
  useEffect(() => {
    if (!getToken()) {
      setAuthState('anon')
      return
    }
    me()
      .then((u) => {
        setUser(u)
        setAuthState('authed')
      })
      .catch(() => {
        logout()
        setAuthState('anon')
      })
  }, [])

  function onAuthed(u) {
    setUser(u)
    setAuthState('authed')
  }

  function signOut() {
    logout()
    setUser(null)
    setAuthState('anon')
  }

  if (authState === 'checking') {
    return (
      <div className="app-splash">
        <div className="rail-brand">J</div>
        <p>Loading Jotter…</p>
      </div>
    )
  }

  if (authState === 'anon') {
    return <AuthScreen onAuthed={onAuthed} />
  }

  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="app-shell">
      <nav className="app-rail">
        <div className="rail-brand">J</div>
        {AREAS.map((a) => (
          <button
            key={a.id}
            className={`rail-item ${area === a.id ? 'active' : ''}`}
            onClick={() => setArea(a.id)}
            title={a.label}
          >
            <span className="rail-icon">{a.icon}</span>
            <span className="rail-label">{a.label}</span>
          </button>
        ))}
        <button className="rail-item rail-settings" onClick={openSettings} title="Storage settings">
          <span className="rail-icon">⚙️</span>
          <span className="rail-label">Settings</span>
        </button>
        <button
          className="rail-item"
          onClick={signOut}
          title={`Signed in as ${user?.email || ''} — click to sign out`}
        >
          <span className="rail-avatar">{(user?.email || '?')[0].toUpperCase()}</span>
          <span className="rail-label">Sign out</span>
        </button>
      </nav>

      <main className="app-main">
        {area === 'notes' && <NotesApp />}
        {area === 'files' && <FilesArea onOpenSettings={openSettings} />}
        {area === 'images' && <ImagesArea onOpenSettings={openSettings} />}
        {area === 'videos' && <VideosArea onOpenSettings={openSettings} />}
        {area === 'screenshots' && <ScreenshotsArea />}
      </main>

      {settingsOpen && <StorageSettings onClose={() => setSettingsOpen(false)} />}
      <PromptHost />
    </div>
  )
}
