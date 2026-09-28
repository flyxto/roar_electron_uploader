import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import './PreviewApp.css'

export default function PreviewApp() {
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const videoRef = useRef(null)

  const queueRef = useRef(queue)
  queueRef.current = queue

  // Load history from backend on mount and build queue with local files ONLY
  useEffect(() => {
    async function initQueue() {
      try {
        const result = await window.api.fetchHistory()
        if (Array.isArray(result) && result.length > 0) {
          // Strictly only include items that exist locally on disk in output folder
          const localQueue = result
            .filter((item) => Boolean(item.localPath))
            .map((item) => ({
              videoId: item.reelId,
              publicUrl: item.videoUrl,
              cloudflareUrl: item.cloudflareUrl,
              localPath: item.localPath
            }))

          if (localQueue.length > 0) {
            setQueue(localQueue)
            setCurrentIndex(0)
          }
        }
      } catch (err) {
        console.error('Failed to load preview history:', err)
      }
    }
    initQueue()
  }, [])

  // Listen for newly processed or background downloaded videos
  useEffect(() => {
    const unsub = window.api.onShowVideo((data) => {
      if (!data || !data.localPath) return

      setQueue((prev) => {
        const existingIndex = prev.findIndex((v) => String(v.videoId) === String(data.videoId))
        if (existingIndex !== -1) {
          const updated = [...prev]
          updated[existingIndex] = { ...updated[existingIndex], ...data }
          return updated
        }

        const newQueue = [...prev, data]

        if (data.jumpImmediately) {
          setCurrentIndex(newQueue.length - 1)
        } else if (prev.length === 0) {
          setCurrentIndex(0)
        }
        // If jumpImmediately is false and prev had items (e.g. background sync download),
        // currentIndex is untouched so the playing video continues uninterrupted!

        return newQueue
      })
    })
    return () => unsub()
  }, [])

  const videoData = queue.length > 0 ? queue[currentIndex] : null

  // Emit status when current video changes
  useEffect(() => {
    if (window.api.sendPreviewStatus) {
      window.api.sendPreviewStatus({
        videoData,
        currentIndex,
        queueLength: queue.length
      })
    }
  }, [currentIndex, videoData, queue.length])

  // Listen for controls from dashboard
  useEffect(() => {
    if (window.api.onPreviewControl) {
      const unsub = window.api.onPreviewControl((control) => {
        if (queue.length === 0) return
        
        if (control.action === 'next') {
          setCurrentIndex(prev => (prev + 1) % queue.length)
        } else if (control.action === 'prev') {
          setCurrentIndex(prev => (prev - 1 + queue.length) % queue.length)
        } else if (control.action === 'play-id') {
          const index = queue.findIndex(v => v.videoId == control.value) // loose equality for string/number
          if (index !== -1) {
            setCurrentIndex(index)
          } else {
            window.api.sendAppLog && window.api.sendAppLog({ 
              type: 'warn', 
              message: `Reel #${control.value} not found in preview queue.` 
            })
          }
        }
      })
      return () => unsub()
    }
  }, [queue])

  // Play video whenever currentIndex/videoData changes
  useEffect(() => {
    if (!videoData || !videoRef.current) return

    // STRICTLY local playback only from output folder. Never stream from online URLs.
    if (!videoData.localPath) {
      console.warn(`[PreviewApp] Reel #${videoData.videoId} has no local file. Skipping online playback.`)
      return
    }

    // Normalize Windows backslashes to forward slashes
    let normalizedPath = videoData.localPath.replace(/\\/g, '/')
    // Ensure it starts with a slash if it's a Windows drive letter
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath
    }
    const src = `file://${encodeURI(normalizedPath)}`

    const video = videoRef.current
    video.src = src
    video.load()

    video.onerror = (e) => {
      const errMessage = video.error ? `${video.error.code} - ${video.error.message}` : 'Unknown'
      console.error('Video load error for:', src, video.error)
      window.api.sendAppLog && window.api.sendAppLog({ type: 'error', message: `Video load error [${errMessage}] for: ${src}` })
      
      // Auto-advance to next video after brief pause so playback isn't stalled indefinitely
      setTimeout(() => {
        handleVideoEnd()
      }, 2000)
    }

    // Autoplay — muted first to pass browser autoplay policy, then unmute
    video.muted = true
    video
      .play()
      .then(() => {
        video.muted = false
        window.api.sendAppLog && window.api.sendAppLog({ type: 'success', message: `Playing video: ${src}` })
      })
      .catch((err) => {
        console.error('Autoplay error:', err)
        window.api.sendAppLog && window.api.sendAppLog({ type: 'error', message: `Autoplay error: ${err.message}` })
      })

    // Generate QR code
    if (videoData.publicUrl) {
      QRCode.toDataURL(videoData.publicUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#000000', light: '#00000000' }
      })
        .then(setQrDataUrl)
        .catch(console.error)
    } else {
      setQrDataUrl(null)
    }
  }, [currentIndex, videoData?.videoId])

  // When video ends → advance to next, loop back to 0 using latest queueRef
  const handleVideoEnd = () => {
    const currentQueue = queueRef.current
    if (currentQueue.length === 0) return
    setCurrentIndex((prev) => (prev + 1) % currentQueue.length)
  }

  return (
    <div className="preview-app">
      <div className="tv-frame">
        <div className="tv-screen">
          {videoData ? (
            <>
              <video
                ref={videoRef}
                className="preview-video"
                onEnded={handleVideoEnd}
                playsInline
                autoPlay
              />
              <div className="preview-info-bar">
                <div className="preview-reel-id">
                  <span className="reel-label">REEL</span>
                  <span className="reel-id">#{videoData.videoId}</span>
                </div>
                {qrDataUrl && (
                  <div className="preview-qr">
                    <img src={qrDataUrl} alt="QR Code" className="qr-image" />
                    <span className="qr-label">Scan to view</span>
                  </div>
                )}
              </div>

            </>
          ) : (
            <div className="preview-idle">
              <div className="idle-icon">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              <p className="idle-title">Waiting for video...</p>
              <p className="idle-sub">Videos will preview here once available in your output folder</p>
              <div className="idle-dot-ring">
                <div className="dot-ring" />
                <div className="dot-ring dot-ring-2" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
