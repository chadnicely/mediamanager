// More tab — account row, import, and sign out. Mirrors what the desktop rail
// offers that makes sense on mobile.

export default function MobileMore({
  user,
  notesCount,
  notebooksCount,
  onImport,
  onOpenMedia,
  onSignIn,
  onSignOut
}) {
  const email = user?.email || ''
  return (
    <div className="m-screen">
      <header className="m-topbar">
        <div className="m-avatar">S</div>
        <div className="m-topbar-title">More</div>
        <div style={{ width: 40 }} />
      </header>

      <div className="m-more-account">
        <div className="m-more-avatar">{(email || 'S')[0].toUpperCase()}</div>
        <div className="m-more-account-text">
          <div className="m-more-email">{email || 'This device'}</div>
          <div className="m-more-sub">
            {notesCount} notes · {notebooksCount} notebooks
          </div>
        </div>
      </div>

      <div className="m-list-divider">Library</div>
      <div className="m-list">
        <button className="m-more-item" onClick={() => onOpenMedia('images')}>
          <MediaIcon />
          <span>Images</span>
          <Chevron />
        </button>
        <button className="m-more-item" onClick={() => onOpenMedia('videos')}>
          <MediaIcon />
          <span>Videos</span>
          <Chevron />
        </button>
        <button className="m-more-item" onClick={() => onOpenMedia('files')}>
          <MediaIcon />
          <span>Files</span>
          <Chevron />
        </button>
        <button className="m-more-item" onClick={() => onOpenMedia('screenshots')}>
          <MediaIcon />
          <span>Screenshots</span>
          <Chevron />
        </button>
      </div>

      <div className="m-list-divider">Account</div>
      <div className="m-list">
        {!user && onSignIn && (
          <button className="m-more-item m-more-signin" onClick={onSignIn}>
            <SignInIcon />
            <span>Sign in / Create account</span>
            <Chevron />
          </button>
        )}
        <button className="m-more-item" onClick={onImport}>
          <ImportIcon />
          <span>Import from Evernote (.enex)</span>
          <Chevron />
        </button>
        {user && onSignOut && (
          <button className="m-more-item danger" onClick={onSignOut}>
            <SignOutIcon />
            <span>Sign out</span>
            <Chevron />
          </button>
        )}
      </div>

      <div className="m-more-version">Sniddy v0.1.0</div>
    </div>
  )
}

function MediaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4-4 3 3 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3v11" strokeLinecap="round" />
      <path d="M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 20h14" strokeLinecap="round" />
    </svg>
  )
}
function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M14 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" strokeLinecap="round" />
      <path d="M17 8l4 4-4 4M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function SignInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M10 4h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-8" strokeLinecap="round" />
      <path d="M7 8l4 4-4 4M11 12H3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function Chevron() {
  return (
    <svg className="m-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
