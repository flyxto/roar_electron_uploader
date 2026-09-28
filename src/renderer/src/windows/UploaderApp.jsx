import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import Dashboard from '../pages/Dashboard'
import SettingsPage from '../pages/SettingsPage'
import JobsPage from '../pages/JobsPage'
import './UploaderApp.css'

export default function UploaderApp() {
  const [page, setPage] = useState('dashboard')
  const [jobs, setJobs] = useState([])
  const [watcherActive, setWatcherActive] = useState(false)
  const [settings, setSettings] = useState(null)
  const [latestJob, setLatestJob] = useState(null)

  useEffect(() => {
    // Load settings
    window.api.getSettings().then(setSettings)
    // Load existing jobs
    window.api.getJobs().then(setJobs)

    // Listen for job updates
    const unsubJob = window.api.onJobUpdate((job) => {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.jobId === job.jobId)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = job
          return next
        }
        return [job, ...prev]
      })
      if (job.status === 'done') {
        setLatestJob(job)
      }
    })

    // Listen for new video detected
    const unsubDetect = window.api.onNewVideoDetected(({ filePath }) => {
      // Auto-handled by main process, just notify UI
      console.log('New video detected:', filePath)
    })

    return () => {
      unsubJob()
      unsubDetect()
    }
  }, [])

  const handleSettingsUpdate = useCallback(async (partial) => {
    const updated = await window.api.updateSettings(partial)
    setSettings(updated)
  }, [])

  const pages = {
    dashboard: (
      <Dashboard
        jobs={jobs}
        settings={settings}
        watcherActive={watcherActive}
        setWatcherActive={setWatcherActive}
        latestJob={latestJob}
        onSettingsUpdate={handleSettingsUpdate}
      />
    ),
    jobs: <JobsPage jobs={jobs} />,
    settings: (
      <SettingsPage
        settings={settings}
        onUpdate={handleSettingsUpdate}
      />
    )
  }

  return (
    <div className="uploader-app">
      <Sidebar activePage={page} onNavigate={setPage} jobs={jobs} />
      <main className="uploader-main">
        {pages[page]}
      </main>
    </div>
  )
}
