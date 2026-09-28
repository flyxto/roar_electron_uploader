import { basename } from '../utils/path'
import './FramePicker.css'

export default function FramePicker({ value, onSelect }) {
  const fileName = value ? basename(value) : null

  return (
    <div className="frame-picker">
      <div className="fp-label">
        <div className="fp-icon" style={{ color: 'var(--warning)' }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <span className="label">Video Frame Overlay</span>
        <span className="frame-badge">PNG</span>
      </div>

      <div className="frame-preview-row">
        {value ? (
          <div className="frame-selected">
            <div className="frame-thumb-placeholder">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <polyline points="3 9 9 9 9 3" />
                <polyline points="21 9 15 9 15 3" />
                <polyline points="3 15 9 15 9 21" />
                <polyline points="21 15 15 15 15 21" />
              </svg>
            </div>
            <div className="frame-file-info">
              <span className="frame-filename">{fileName}</span>
              <span style={{ fontSize: '11px', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Frame active
              </span>
            </div>
          </div>
        ) : (
          <div className="frame-empty">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span>No frame selected — video will be cropped only</span>
          </div>
        )}
        <button className="btn btn-secondary btn-sm" onClick={onSelect}>
          {value ? 'Change' : 'Select Frame'}
        </button>
      </div>

      <p className="frame-hint">
        Upload a 9:16 PNG with transparent center — it will be overlaid on the processed video
      </p>
    </div>
  )
}
