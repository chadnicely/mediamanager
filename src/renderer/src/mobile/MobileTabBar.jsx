// Evernote-style floating bottom navigation: Create · Notes · Notebooks · More
// plus the round AI/assistant button on the right.

const TABS = [
  { id: 'create', label: 'Home', icon: HomeIcon },
  { id: 'notes', label: 'Notes', icon: NotesIcon },
  { id: 'notebooks', label: 'Notebooks', icon: BookIcon },
  { id: 'more', label: 'More', icon: MoreIcon }
]

export default function MobileTabBar({ active, onChange }) {
  return (
    <nav className="m-tabbar">
      <div className="m-tabbar-pill">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              className={`m-tab ${active === t.id ? 'active' : ''}`}
              onClick={() => onChange(t.id)}
            >
              <Icon />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
      <button className="m-ai-btn" title="Assistant" onClick={() => onChange('create')}>
        <SparkIcon />
      </button>
    </nav>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11l8-6 8 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" strokeLinejoin="round" />
    </svg>
  )
}
function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  )
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 4h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path d="M8 4v17" />
    </svg>
  )
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </svg>
  )
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2z" />
      <path d="M18 14l.9 2.6L21.5 17.5l-2.6.9L18 21l-.9-2.6-2.6-.9 2.6-.9L18 14z" opacity="0.7" />
    </svg>
  )
}
