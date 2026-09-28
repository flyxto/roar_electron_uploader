import './FolderPicker.css'

export default function FolderPicker({ label, value, onSelect, icon, color }) {
  return (
    <div className="folder-picker">
      <div className="fp-label">
        <div className="fp-icon" style={{ color }}>
          {icon}
        </div>
        <span className="label">{label}</span>
      </div>
      <div className="fp-row">
        <div className="fp-path">
          {value ? (
            <span className="fp-path-text mono">{value}</span>
          ) : (
            <span className="fp-placeholder">Not selected</span>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onSelect}>
          Browse
        </button>
      </div>
    </div>
  )
}
