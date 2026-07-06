// Top bar for media areas: optional left content (breadcrumbs / group name)
// and, top-right, the primary "Add X" button with a "Scan Computer for X" link.
export default function AddBar({ label, left, onAdd, onScan }) {
  return (
    <div className="area-topbar">
      <div className="area-topbar-left">{left}</div>
      <div className="area-topbar-right">
        <button className="btn-primary" onClick={onAdd}>
          Add {label}
        </button>
        <button className="link-btn" onClick={onScan}>
          Scan Computer for {label}
        </button>
      </div>
    </div>
  )
}
