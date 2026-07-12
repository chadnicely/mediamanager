// Home — Sniddy's own dashboard (not the Evernote clone). A greeting header, a
// compact quick-capture row, and a grid of "spaces" that surfaces the whole
// library (Notes, Notebooks, Images, Videos, Files, Screenshots) up front.

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const SPACES = [
  { id: 'notes', label: 'Notes', tint: '#4f46e5', icon: NotesIcon },
  { id: 'notebooks', label: 'Notebooks', tint: '#2563eb', icon: BookIcon },
  { id: 'images', label: 'Images', tint: '#0d9488', icon: ImageIcon },
  { id: 'videos', label: 'Videos', tint: '#e11d48', icon: VideoIcon },
  { id: 'files', label: 'Files', tint: '#d97706', icon: FileIcon },
  { id: 'screenshots', label: 'Screenshots', tint: '#7c3aed', icon: ShotIcon }
]

export default function MobileHome({
  user,
  counts,
  onNewNote,
  onCamera,
  onOpenSearch,
  onOpenSpace
}) {
  const initial = (user?.email || 'S')[0].toUpperCase()
  return (
    <div className="m-home">
      <header className="m-home-bar">
        <div className="m-home-brand">
          <img className="m-home-logo" src="./icon-192.png" alt="Sniddy" />
          <span className="m-home-word">sniddy</span>
        </div>
        <button className="m-home-me" onClick={onOpenSearch} aria-label="Search">
          <SearchIcon />
        </button>
      </header>

      <div className="m-hero">
        <div className="m-hero-greet">{greeting()}</div>
        <div className="m-hero-sub">Capture anything. Find it anywhere.</div>
      </div>

      <button className="m-home-search" onClick={onOpenSearch}>
        <SearchIcon />
        <span>Search everything</span>
      </button>

      <div className="m-capture-row">
        <button className="m-capture m-capture-primary" onClick={onNewNote}>
          <PenIcon />
          <span>New Note</span>
        </button>
        <button className="m-capture" onClick={onCamera}>
          <CamIcon />
          <span>Photo</span>
        </button>
      </div>

      <div className="m-section-head">Your library</div>
      <div className="m-spaces">
        {SPACES.map((s) => {
          const Icon = s.icon
          const count = counts?.[s.id]
          return (
            <button key={s.id} className="m-space" onClick={() => onOpenSpace(s.id)}>
              <span className="m-space-chip" style={{ background: `${s.tint}1a`, color: s.tint }}>
                <Icon />
              </span>
              <span className="m-space-label">{s.label}</span>
              {count != null && <span className="m-space-count">{count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---- icons ---- */
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}
function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 20l4-1 10-10-3-3L5 16l-1 4z" strokeLinejoin="round" />
      <path d="M14 6l3 3" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8 12l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}
function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  )
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 4v17" />
    </svg>
  )
}
function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M5 17l4-4 3 3 3-3 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" strokeLinejoin="round" />
    </svg>
  )
}
function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5" />
    </svg>
  )
}
function ShotIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17v4" strokeLinecap="round" />
    </svg>
  )
}
