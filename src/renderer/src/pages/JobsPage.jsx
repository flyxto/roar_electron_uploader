import { useState, useEffect } from 'react'
import JobCard from '../components/JobCard'
import './JobsPage.css'

export default function JobsPage({ jobs }) {
  const [history, setHistory] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadHistory() {
      const result = await window.api.fetchHistory()
      if (Array.isArray(result)) {
        // fetchHistory returns oldest-first; reverse for table (newest first)
        setHistory([...result].reverse())
      }
      setLoading(false)
    }
    loadHistory()
  }, [])

  const stats = {
    total: jobs.length,
    active: jobs.filter((j) => ['processing', 'uploading', 'saving'].includes(j.status)).length,
    done: jobs.filter((j) => j.status === 'done').length,
    error: jobs.filter((j) => j.status === 'error').length
  }

  const filteredHistory = history.filter(
    (h) =>
      h.reelId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.videoUrl.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="jobs-page" style={{ height: '100%', overflowY: 'auto' }}>
      <div className="page-header">
        <div>
          <h1 className="dash-title">Jobs & History</h1>
          <p className="dash-subtitle">Active processing jobs and past uploads</p>
        </div>
      </div>

      {/* Stats */}
      <div className="jobs-stats-row">
        <div className="stat-card">
          <span className="stat-card-value">{stats.total}</span>
          <span className="stat-card-label">Total Jobs (Session)</span>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
          <span className="stat-card-value" style={{ color: 'var(--info)' }}>{stats.active}</span>
          <span className="stat-card-label">Active</span>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(16,185,129,0.3)' }}>
          <span className="stat-card-value" style={{ color: 'var(--success)' }}>{stats.done}</span>
          <span className="stat-card-label">Done</span>
        </div>
        <div className="stat-card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <span className="stat-card-value" style={{ color: 'var(--danger)' }}>{stats.error}</span>
          <span className="stat-card-label">Error</span>
        </div>
      </div>

      {/* Active Jobs list */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>Current Session Jobs</h2>
          <div className="all-jobs-list">
            {jobs.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="history-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 className="section-title">Upload History</h2>
          <input
            type="text"
            className="input"
            placeholder="Search by Video ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '250px' }}
          />
        </div>

        {loading ? (
          <div className="empty-jobs">
            <div className="dot-ring" style={{ position: 'relative', width: '40px', height: '40px' }} />
            <p style={{ marginTop: '20px' }}>Loading history from backend...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="empty-jobs">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 600, marginTop: '10px' }}>No videos found</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Reel ID</th>
                  <th>Date</th>
                  <th>Cloudflare URL</th>
                  <th>Public URL</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <strong>#{item.reelId}</strong>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <a href={item.cloudflareUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--info)' }}>
                        View Video
                      </a>
                    </td>
                    <td>
                      <a href={item.videoUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--success)' }}>
                        Public Link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
