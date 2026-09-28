import { useState, useEffect } from 'react'
import './SettingsPage.css'

const SECTIONS = [
  {
    id: 'r2',
    title: 'Cloudflare R2',
    icon: '☁️',
    fields: [
      { key: 'r2AccountId', label: 'Account ID', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'r2AccessKeyId', label: 'Access Key ID', placeholder: 'R2 Access Key ID', type: 'text' },
      { key: 'r2SecretAccessKey', label: 'Secret Access Key', placeholder: '••••••••••••••••', type: 'password' },
      { key: 'r2BucketName', label: 'Bucket Name', placeholder: 'my-reels-bucket', type: 'text' },
      { key: 'r2PublicUrl', label: 'Public URL', placeholder: 'https://pub.r2.dev/...', type: 'text' }
    ]
  },
  {
    id: 'backend',
    title: 'Backend API',
    icon: '🔌',
    fields: [
      { key: 'backendApiUrl', label: 'API Base URL', placeholder: 'http://localhost:3000', type: 'text' },
      { key: 'reelBaseUrl', label: 'Reel Base URL', placeholder: 'https://roaradx.flyxto.com/reels', type: 'text' }
    ]
  },
  {
    id: 'folders',
    title: 'Folders',
    icon: '📁',
    fields: []
  }
]

export default function SettingsPage({ settings, onUpdate }) {
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) setForm({ ...settings })
  }, [settings])

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    await onUpdate(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSelectFolder = async (key) => {
    const folder = await window.api.selectFolder()
    if (folder) {
      setForm((prev) => ({ ...prev, [key]: folder }))
    }
  }

  const handleSelectFrame = async () => {
    const path = await window.api.selectFrameImage()
    if (path) {
      setForm((prev) => ({ ...prev, framePath: path }))
    }
  }

  if (!settings) {
    return (
      <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Loading settings...
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <h1 className="dash-title">Settings</h1>
          <p className="dash-subtitle">Configure your credentials and file paths</p>
        </div>
        <button
          className={`btn ${saved ? 'btn-success' : 'btn-primary'} btn-lg`}
          onClick={handleSave}
        >
          {saved ? (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Settings
            </>
          )}
        </button>
      </div>

      <div className="settings-sections">
        {SECTIONS.map((section) => (
          <div key={section.id} className="settings-section">
            <div className="section-head">
              <span className="section-emoji">{section.icon}</span>
              <h2 className="section-title-lg">{section.title}</h2>
            </div>

            <div className="settings-fields">
              {section.fields.map((field) => (
                <div key={field.key} className="settings-field">
                  <label className="label">{field.label}</label>
                  <input
                    className="input"
                    type={field.type}
                    value={form[field.key] || ''}
                    placeholder={field.placeholder}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                  />
                </div>
              ))}

              {/* Folder fields */}
              {section.id === 'folders' && (
                <>
                  <div className="settings-field">
                    <label className="label">Watch Folder</label>
                    <div className="folder-input-row">
                      <input
                        className="input"
                        type="text"
                        readOnly
                        value={form.watchFolder || ''}
                        placeholder="Folder to watch for new videos"
                      />
                      <button className="btn btn-secondary" onClick={() => handleSelectFolder('watchFolder')}>
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label className="label">Output Folder</label>
                    <div className="folder-input-row">
                      <input
                        className="input"
                        type="text"
                        readOnly
                        value={form.outputFolder || ''}
                        placeholder="Where processed videos are saved"
                      />
                      <button className="btn btn-secondary" onClick={() => handleSelectFolder('outputFolder')}>
                        Browse
                      </button>
                    </div>
                  </div>

                  <div className="settings-field">
                    <label className="label">Frame Overlay (PNG)</label>
                    <div className="folder-input-row">
                      <input
                        className="input"
                        type="text"
                        readOnly
                        value={form.framePath || ''}
                        placeholder="Optional PNG frame overlay for videos"
                      />
                      <button className="btn btn-secondary" onClick={handleSelectFrame}>
                        Select
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      9:16 PNG with transparent center — overlaid on processed video via FFmpeg
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* Info card & Danger Zone */}
        <div className="info-card">
          <div className="info-icon">ℹ️</div>
          <div className="info-content">
            <strong>Video Processing</strong>
            <p>
              Videos are cropped to <code>9:16</code> portrait by trimming the left and right
              sides — original height is preserved. The frame overlay is composited on top via
              FFmpeg before uploading to R2.
            </p>
          </div>
        </div>

        <div className="settings-section" style={{ marginTop: '32px', border: '1px solid var(--danger)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <div className="section-head" style={{ borderBottomColor: 'var(--danger)' }}>
            <span className="section-emoji">⚠️</span>
            <h2 className="section-title-lg" style={{ color: 'var(--danger)' }}>Danger Zone</h2>
          </div>
          <div className="settings-fields" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block', color: 'var(--text-main)', marginBottom: '4px' }}>Clear Local & Backend History</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Wipes local processed tracker AND deletes all records from the MongoDB backend.</span>
              </div>
              <button 
                className="btn btn-danger" 
                onClick={async () => {
                  if (confirm('Are you sure you want to clear ALL history? This will delete MongoDB records and clear the local cache.')) {
                    await window.api.clearHistory()
                    alert('History cleared! Please restart the app.')
                  }
                }}
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
