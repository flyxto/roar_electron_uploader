import './JobCard.css'

const STATUS_LABELS = {
  processing: 'Processing',
  uploading: 'Uploading',
  saving: 'Saving',
  done: 'Done',
  error: 'Error',
  idle: 'Idle'
}

export default function JobCard({ job }) {
  const isActive = ['processing', 'uploading', 'saving'].includes(job.status)
  const elapsed = job.startTime ? Math.round((Date.now() - job.startTime) / 1000) : 0

  const previewJob = async () => {
    if (job.localPath) {
      await window.api.openPreviewWindow()
      setTimeout(() => {
        window.api.sendPreviewVideo({
          localPath: job.localPath,
          cloudflareUrl: job.cloudflareUrl,
          publicUrl: job.publicUrl,
          videoId: job.videoId
        })
      }, 1000)
    }
  }

  return (
    <div className={`job-card animate-fade-in ${job.status}`}>
      <div className="job-card-top">
        <div className="job-info">
          <div className="job-name">{job.fileName || job.videoId}</div>
          <div className="job-meta">
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              #{job.videoId}
            </span>
            {isActive && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{elapsed}s</span>
            )}
          </div>
        </div>
        <div className="job-actions">
          <span className={`badge badge-${job.status}`}>{STATUS_LABELS[job.status]}</span>
          {job.status === 'done' && (
            <button className="btn btn-sm btn-secondary" onClick={previewJob} title="Preview">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="job-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${job.progress}%` }} />
          </div>
          <span className="progress-label">{job.progress}%</span>
        </div>
      )}

      {/* Done URLs */}
      {job.status === 'done' && (
        <div className="job-urls">
          {job.publicUrl && (
            <div className="url-row">
              <span className="url-label">Reel URL</span>
              <span className="url-value mono">{job.publicUrl}</span>
            </div>
          )}
          {job.cloudflareUrl && (
            <div className="url-row">
              <span className="url-label">R2 URL</span>
              <span className="url-value mono truncate">{job.cloudflareUrl}</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job.status === 'error' && (
        <div className="job-error">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {job.error}
        </div>
      )}
    </div>
  )
}
