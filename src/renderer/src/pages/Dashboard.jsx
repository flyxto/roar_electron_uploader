import { useState, useCallback, useEffect, useRef } from 'react'
import JobCard from '../components/JobCard'
import './Dashboard.css'
import './Dashboard-logger.css'

export default function Dashboard({
  jobs,
  settings,
  watcherActive,
  setWatcherActive,
  latestJob,
  onSettingsUpdate
}) {
  const [processing, setProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const activeJobs = jobs.filter((j) => ['processing', 'uploading', 'saving'].includes(j.status))
  const recentJobs = jobs.slice(0, 5)

  const handleToggleWatcher = async () => {
    if (!settings?.watchFolder) {
      alert('Please set the Watch Folder first in Settings.')
      return
    }
    if (watcherActive) {
      await window.api.stopWatcher()
      setWatcherActive(false)
    } else {
      const result = await window.api.startWatcher(settings.watchFolder)
      if (result.success) setWatcherActive(true)
    }
  }



  const handleManualProcess = useCallback(async () => {
    if (!settings?.outputFolder) {
      alert('Please set the Output Folder first.')
      return
    }
    // Open file dialog
    const { ipcRenderer } = window.electron
    const result = await window.electron.ipcRenderer.invoke('select-folder')
    // Actually let's use a video file dialog
    // We need to trigger via a special approach
    // For now, use drag and drop or let user put files in watch folder
  }, [settings])

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault()
      setDragOver(false)
      const files = Array.from(e.dataTransfer.files)
      const videos = files.filter((f) => f.type.startsWith('video/'))
      if (videos.length === 0) return

      if (!settings?.outputFolder) {
        alert('Please set the Output Folder first.')
        return
      }

      for (const file of videos) {
        setProcessing(true)
        try {
          await window.api.processVideo(file.path)
        } catch (err) {
          console.error('Process error:', err)
        } finally {
          setProcessing(false)
        }
      }
    },
    [settings]
  )

  const previewLatest = async () => {
    if (latestJob) {
      await window.api.openPreviewWindow()
      setTimeout(() => {
        window.api.sendPreviewVideo({
          localPath: latestJob.localPath,
          cloudflareUrl: latestJob.cloudflareUrl,
          publicUrl: latestJob.publicUrl,
          videoId: latestJob.videoId
        })
      }, 1000)
    }
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard</h1>
          <p className="dash-subtitle">Upload, process, and publish your reels</p>
        </div>
        <div className="dash-header-actions">
          {latestJob && (
            <button className="btn btn-success" onClick={previewLatest}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Preview Latest
            </button>
          )}
          <button
            className={`btn ${watcherActive ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleToggleWatcher}
          >
            {watcherActive ? (
              <>
                <span className="dot-active" />
                Stop Watcher
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Start Watcher
              </>
            )}
          </button>
        </div>
      </div>

      {/* Watcher status banner */}
      {watcherActive && (
        <div className="watcher-banner animate-fade-in">
          <div className="watcher-dot" />
          <span>
            Watching: <code>{settings?.watchFolder || '...'}</code>
          </span>
          <span className="watcher-sub">New videos will be automatically processed</span>
        </div>
      )}

      <div className="dash-grid">
        {/* Left column */}
        <div className="dash-col">
          {/* Drop Zone */}
          <div
            className={`drop-zone ${dragOver ? 'drag-over' : ''} ${processing ? 'processing' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="drop-icon">
              {processing ? (
                <svg className="animate-spin" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              )}
            </div>
            <p className="drop-title">
              {processing ? 'Processing...' : dragOver ? 'Drop video here' : 'Drag & Drop Video'}
            </p>
            <p className="drop-sub">
              {processing
                ? 'FFmpeg is processing your video'
                : 'Drop a video file to process and upload it'}
            </p>
          </div>

          {/* App Logger */}
          <AppLogger />
        </div>

        {/* Right column: Recent jobs */}
        <div className="dash-col">
          <PreviewController />

          <div className="section-header">
            <h2 className="section-title">Recent Jobs</h2>
            {activeJobs.length > 0 && (
              <span className="badge badge-processing animate-pulse">
                {activeJobs.length} active
              </span>
            )}
          </div>

          <div className="jobs-list">
            {recentJobs.length === 0 ? (
              <div className="empty-jobs">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)' }}>
                  <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <p>No jobs yet</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Drop a video or start the folder watcher
                </p>
              </div>
            ) : (
              recentJobs.map((job) => <JobCard key={job.jobId} job={job} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppLogger() {
  const [logs, setLogs] = useState([])
  const logsEndRef = useRef(null)

  useEffect(() => {
    if (window.api.onAppLog) {
      const unsub = window.api.onAppLog((log) => {
        setLogs((prev) => [...prev.slice(-99), log]) // Keep last 100 logs
      })
      return () => unsub()
    }
  }, [])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="app-logger">
      <div className="logger-header">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        App Logs
      </div>
      <div className="logger-content">
        {logs.length === 0 ? (
          <div className="logger-empty">No logs yet...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`log-line ${log.type}`}>
              <span className="log-time">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

function PreviewController() {
  const [status, setStatus] = useState(null)
  const [inputId, setInputId] = useState('')

  useEffect(() => {
    if (window.api.onPreviewStatus) {
      const unsub = window.api.onPreviewStatus((data) => {
        setStatus(data)
      })
      return () => unsub()
    }
  }, [])

  const handleControl = (action, value = null) => {
    if (window.api.sendPreviewControl) {
      window.api.sendPreviewControl({ action, value })
    }
  }

  return (
    <div className="preview-controller" style={{ marginBottom: '24px', background: 'var(--bg-surface)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 className="section-title" style={{ margin: 0, border: 'none' }}>Preview Control</h2>
        {status?.videoData ? (
          <span style={{ fontSize: '12px', background: 'var(--primary)', color: 'var(--bg-dark)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
            Playing: #{status.videoData.videoId}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Idle</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button 
          className="btn" 
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)' }}
          onClick={() => handleControl('prev')}
          disabled={!status}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg>
          Previous
        </button>
        
        <button 
          className="btn" 
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)' }}
          onClick={() => handleControl('next')}
          disabled={!status}
        >
          Next
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          placeholder="Enter ID (e.g. 1001)" 
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          className="folder-picker-input"
          style={{ flex: 1, height: '36px' }}
        />
        <button 
          className="btn btn-primary"
          onClick={() => {
            if (inputId.trim()) {
              handleControl('play-id', inputId.trim())
            }
          }}
          disabled={!status}
        >
          Play ID
        </button>
      </div>
    </div>
  )
}
