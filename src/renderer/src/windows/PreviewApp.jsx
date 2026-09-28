import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import './PreviewApp.css'

// Hardcoded TV display configuration
const DISPLAY_CONFIG = {
  videoHeightVh: 77,
  paddingV: 80,
  qrSizePx: 185,
  textScale: 1.05
}

// Helper to format Windows/Unix paths to a safe local file:// URI
function toLocalVideoSrc(localPath) {
  if (!localPath) return ''
  let normalizedPath = localPath.replace(/\\/g, '/')
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath
  }
  return `file://${encodeURI(normalizedPath)}`
}

export default function PreviewApp() {
  const [queue, setQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeSlot, setActiveSlot] = useState(0) // 0 for Slot A, 1 for Slot B
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const videoRefA = useRef(null)
  const videoRefB = useRef(null)
  const transitionTimeoutRef = useRef(null)

  const queueRef = useRef(queue)
  queueRef.current = queue

  const currentIndexRef = useRef(currentIndex)
  currentIndexRef.current = currentIndex

  const activeSlotRef = useRef(activeSlot)
  activeSlotRef.current = activeSlot

  const isTransitioningRef = useRef(isTransitioning)
  isTransitioningRef.current = isTransitioning

  // The displayed video for QR & details updates immediately when transition begins
  const displayedIndex = isTransitioning ? (currentIndex + 1) % (queue.length || 1) : currentIndex
  const displayedVideo = queue.length > 0 ? queue[displayedIndex] : null

  // Load history from backend on mount and build queue with local files ONLY
  useEffect(() => {
    async function initQueue() {
      try {
        const result = await window.api.fetchHistory()
        if (Array.isArray(result) && result.length > 0) {
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

        return newQueue
      })
    })
    return () => unsub()
  }, [])

  // Start smooth TikTok swipe-up transition to next video
  const startScrollTransition = () => {
    if (isTransitioningRef.current) return
    const curQueue = queueRef.current
    if (curQueue.length === 0) return

    setIsTransitioning(true)

    // Play incoming video as it scrolls in from bottom
    const currentSlot = activeSlotRef.current
    const incomingRef = currentSlot === 0 ? videoRefB.current : videoRefA.current
    if (incomingRef) {
      incomingRef.currentTime = 0
      incomingRef.muted = true
      incomingRef
        .play()
        .then(() => {
          incomingRef.muted = false
        })
        .catch(console.warn)
    }

    clearTimeout(transitionTimeoutRef.current)
    transitionTimeoutRef.current = setTimeout(() => {
      finishTransition()
    }, 600) // Fallback if transitionend event doesn't fire
  }

  // Complete TikTok swipe: snap positions and preload next video
  const finishTransition = () => {
    clearTimeout(transitionTimeoutRef.current)
    if (!isTransitioningRef.current) return

    const curQueue = queueRef.current
    if (curQueue.length === 0) {
      setIsTransitioning(false)
      return
    }

    const currentSlot = activeSlotRef.current
    const newActiveSlot = currentSlot === 0 ? 1 : 0
    const nextCurIndex = (currentIndexRef.current + 1) % curQueue.length

    // Pause outgoing video that is now off-screen
    const outgoingRef = currentSlot === 0 ? videoRefA.current : videoRefB.current
    if (outgoingRef) {
      outgoingRef.pause()
      outgoingRef.muted = true
    }

    // Preload next upcoming video into the outgoing slot
    const upcomingIndex = (nextCurIndex + 1) % curQueue.length
    const upcomingReel = curQueue[upcomingIndex]
    if (outgoingRef && upcomingReel && upcomingReel.localPath) {
      const upcomingSrc = toLocalVideoSrc(upcomingReel.localPath)
      outgoingRef.setAttribute('data-src', upcomingReel.localPath)
      outgoingRef.src = upcomingSrc
      outgoingRef.load()
      outgoingRef.muted = true
    }

    setCurrentIndex(nextCurIndex)
    setActiveSlot(newActiveSlot)
    setIsTransitioning(false)
  }

  const handleTransitionEnd = (e) => {
    if (e && e.propertyName !== 'transform') return
    finishTransition()
  }

  // Determine sliding CSS class for each video slot
  const getSlotClass = (slot) => {
    if (activeSlot === slot) {
      return isTransitioning ? 'tiktok-slot-slide-out' : 'tiktok-slot-active'
    } else {
      return isTransitioning ? 'tiktok-slot-slide-in' : 'tiktok-slot-next'
    }
  }

  // Sync / initialize video sources for current and upcoming slots
  useEffect(() => {
    if (queue.length === 0) return

    const cur = queue[currentIndex]
    const nextIdx = (currentIndex + 1) % queue.length
    const nxt = queue[nextIdx]

    if (activeSlot === 0) {
      if (videoRefA.current && cur?.localPath) {
        if (videoRefA.current.getAttribute('data-src') !== cur.localPath) {
          videoRefA.current.setAttribute('data-src', cur.localPath)
          const srcA = toLocalVideoSrc(cur.localPath)
          videoRefA.current.src = srcA
          videoRefA.current.load()
          videoRefA.current.muted = true
          videoRefA.current
            .play()
            .then(() => {
              videoRefA.current.muted = false
              window.api.sendAppLog && window.api.sendAppLog({ type: 'success', message: `Playing video: ${srcA}` })
            })
            .catch(console.warn)
        }
      }
      if (videoRefB.current && nxt?.localPath) {
        if (videoRefB.current.getAttribute('data-src') !== nxt.localPath) {
          videoRefB.current.setAttribute('data-src', nxt.localPath)
          videoRefB.current.src = toLocalVideoSrc(nxt.localPath)
          videoRefB.current.load()
          videoRefB.current.muted = true
        }
      }
    } else {
      if (videoRefB.current && cur?.localPath) {
        if (videoRefB.current.getAttribute('data-src') !== cur.localPath) {
          videoRefB.current.setAttribute('data-src', cur.localPath)
          const srcB = toLocalVideoSrc(cur.localPath)
          videoRefB.current.src = srcB
          videoRefB.current.load()
          videoRefB.current.muted = true
          videoRefB.current
            .play()
            .then(() => {
              videoRefB.current.muted = false
              window.api.sendAppLog && window.api.sendAppLog({ type: 'success', message: `Playing video: ${srcB}` })
            })
            .catch(console.warn)
        }
      }
      if (videoRefA.current && nxt?.localPath) {
        if (videoRefA.current.getAttribute('data-src') !== nxt.localPath) {
          videoRefA.current.setAttribute('data-src', nxt.localPath)
          videoRefA.current.src = toLocalVideoSrc(nxt.localPath)
          videoRefA.current.load()
          videoRefA.current.muted = true
        }
      }
    }
  }, [queue.length, queue[currentIndex]?.videoId])

  // Emit status when displayed video changes
  useEffect(() => {
    if (window.api.sendPreviewStatus && displayedVideo) {
      window.api.sendPreviewStatus({
        videoData: displayedVideo,
        currentIndex: displayedIndex,
        queueLength: queue.length
      })
    }
  }, [displayedIndex, displayedVideo, queue.length])

  // Listen for controls from dashboard
  useEffect(() => {
    if (window.api.onPreviewControl) {
      const unsub = window.api.onPreviewControl((control) => {
        if (queue.length === 0) return
        
        if (control.action === 'next') {
          startScrollTransition()
        } else if (control.action === 'prev') {
          setCurrentIndex((prev) => (prev - 1 + queue.length) % queue.length)
        } else if (control.action === 'play-id') {
          const index = queue.findIndex((v) => String(v.videoId) === String(control.value))
          if (index !== -1) {
            setCurrentIndex(index)
          }
        }
      })
      return () => unsub()
    }
  }, [queue.length])

  // Generate QR code for displayed video
  useEffect(() => {
    if (displayedVideo?.publicUrl) {
      QRCode.toDataURL(displayedVideo.publicUrl, {
        width: 320,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
      })
        .then(setQrDataUrl)
        .catch(console.error)
    } else {
      setQrDataUrl(null)
    }
  }, [displayedVideo?.publicUrl])

  return (
    <div className="preview-app">
      {/* Moving TikTok background icons & tiny floating particles */}
      <div className="floating-background">
        <TikTokLogo className="floating-icon floating-icon-1" />
        <TikTokLogo className="floating-icon floating-icon-2" />
        <TikTokLogo className="floating-icon floating-icon-3" />
        <TikTokLogo className="floating-icon floating-icon-4" />
        <TikTokLogo className="floating-icon floating-icon-5" />
        <TikTokLogo className="floating-icon floating-icon-6" />
        <TikTokLogo className="floating-icon floating-icon-7" />
        <TikTokLogo className="floating-icon floating-icon-8" />

        {/* Tiny ambient floating particles */}
        <span className="particle p-cyan p1" />
        <span className="particle p-pink p2" />
        <span className="particle p-white p3" />
        <span className="particle p-cyan p4" />
        <span className="particle p-pink p5" />
        <span className="particle p-white p6" />
        <span className="particle p-cyan p7" />
        <span className="particle p-pink p8" />
        <span className="particle p-white p9" />
        <span className="particle p-cyan p10" />
        <span className="particle p-pink p11" />
        <span className="particle p-white p12" />
        <span className="particle p-cyan p13" />
        <span className="particle p-pink p14" />
        <span className="particle p-white p15" />
        <span className="particle p-cyan p16" />
        <span className="particle p-pink p17" />
        <span className="particle p-white p18" />
        <span className="particle p-cyan p19" />
        <span className="particle p-pink p20" />
        <span className="particle p-white p21" />
        <span className="particle p-cyan p22" />
        <span className="particle p-pink p23" />
        <span className="particle p-white p24" />
        <span className="particle p-cyan p25" />
        <span className="particle p-pink p26" />
        <span className="particle p-white p27" />
        <span className="particle p-cyan p28" />
      </div>

      {/* Progressive Blur at top of screen (fading towards video top) */}
      <div className="gradient-blur gradient-blur-top">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>

      {/* Progressive Blur at bottom of screen (under QR & text, fading towards video bottom) */}
      <div className="gradient-blur gradient-blur-bottom">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <div></div>
      </div>

      <div className="tv-frame">
        <div className="tv-screen">
          {displayedVideo ? (
            <div
              className="preview-layout"
              style={{
                paddingTop: `${DISPLAY_CONFIG.paddingV}px`,
                paddingBottom: `${DISPLAY_CONFIG.paddingV}px`
              }}
            >
              {/* Video Player (TikTok-style Vertical Feed Scroll) */}
              <div
                className="preview-stage"
                style={{
                  height: `${DISPLAY_CONFIG.videoHeightVh}vh`,
                  maxHeight: `${DISPLAY_CONFIG.videoHeightVh}vh`
                }}
              >
                <div
                  className="tiktok-feed-viewport"
                  onClick={() => startScrollTransition()}
                  title="Click to scroll to next video"
                >
                  <video
                    ref={videoRefA}
                    className={`tiktok-video-item ${getSlotClass(0)}`}
                    onEnded={() => {
                      if (activeSlot === 0 && !isTransitioning) startScrollTransition()
                    }}
                    onError={() => {
                      if (activeSlot === 0 && !isTransitioning) setTimeout(startScrollTransition, 1500)
                    }}
                    onTransitionEnd={handleTransitionEnd}
                    playsInline
                    autoPlay
                  />
                  <video
                    ref={videoRefB}
                    className={`tiktok-video-item ${getSlotClass(1)}`}
                    onEnded={() => {
                      if (activeSlot === 1 && !isTransitioning) startScrollTransition()
                    }}
                    onError={() => {
                      if (activeSlot === 1 && !isTransitioning) setTimeout(startScrollTransition, 1500)
                    }}
                    onTransitionEnd={handleTransitionEnd}
                    playsInline
                  />
                </div>
              </div>

              {/* Promo Details & QR Code Under the Video (Text Left, QR Right) */}
              <div className="promo-section">
                {/* Left: Text & Hashtags */}
                <div className="promo-text-col">
                  <h2
                    className="promo-title"
                    style={{ fontSize: `clamp(22px, ${3.5 * DISPLAY_CONFIG.textScale}vh, ${44 * DISPLAY_CONFIG.textScale}px)` }}
                  >
                    Scan, Share & Win
                  </h2>

                  <div
                    className="promo-sub-row"
                    style={{ fontSize: `clamp(13px, ${1.75 * DISPLAY_CONFIG.textScale}vh, ${21 * DISPLAY_CONFIG.textScale}px)` }}
                  >
                    <span>Tag</span>
                    <TikTokLogo className="inline-tiktok-icon" />
                    <span className="promo-tag-handle">@roar.adx</span>
                  </div>

                  <div
                    className="promo-sub-row"
                    style={{ fontSize: `clamp(13px, ${1.75 * DISPLAY_CONFIG.textScale}vh, ${21 * DISPLAY_CONFIG.textScale}px)` }}
                  >
                    <span className="promo-use-label">Use</span>
                    <span className="promo-hashtag">#DigitalSummitAsia</span>
                    <span className="promo-hashtag">#DMASLSummit2026</span>
                  </div>
                </div>

                {/* Right: QR Code Card */}
                {qrDataUrl && (
                  <div className="promo-qr-card">
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="promo-qr-image"
                      style={{
                        width: `${DISPLAY_CONFIG.qrSizePx}px`,
                        height: `${DISPLAY_CONFIG.qrSizePx}px`
                      }}
                    />
                    <div
                      className="promo-reel-id"
                      style={{ fontSize: `clamp(9px, ${1.2 * DISPLAY_CONFIG.textScale}vh, ${14 * DISPLAY_CONFIG.textScale}px)` }}
                    >
                      REEL NO - {displayedVideo.videoId}
                    </div>
                  </div>
                )}
              </div>
            </div>
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

function TikTokLogo({ className }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        fill="#FF004F"
        d="M22.459 6.846v3.659c-.197 0-.433.04-.669.04a7.295 7.295 0 01-4.682-1.732v7.79a6.987 6.987 0 01-1.416 4.25 7.02 7.02 0 01-5.626 2.832 6.993 6.993 0 01-5.941-3.305c1.259 1.18 2.95 1.928 4.8 1.928a6.893 6.893 0 005.586-2.833c.866-1.18 1.417-2.636 1.417-4.249v-7.83c1.259 1.102 2.872 1.732 4.682 1.732.236 0 .433 0 .669-.04v-2.36c.354.079.669.118 1.023.118h.157z"
      />
      <path
        fill="#FF004F"
        d="M11.05 9.56v4.053a3.277 3.277 0 00-.866-.118c-1.732 0-3.148 1.456-3.148 3.226 0 .394.079.748.197 1.102-.787-.59-1.338-1.535-1.338-2.597 0-1.77 1.416-3.226 3.148-3.226.314 0 .59.04.865.118V9.521h.236c.315 0 .63 0 .905.04zM17.698 3.934c-.708-.63-1.22-1.495-1.495-2.4h.945v.551a6.25 6.25 0 00.55 1.85z"
      />
      <path
        fill="#FFFFFF"
        d="M21.318 6.767v2.36c-.197.04-.433.04-.669.04a7.295 7.295 0 01-4.682-1.73v7.79a6.987 6.987 0 01-1.416 4.248c-1.299 1.732-3.305 2.833-5.587 2.833-1.85 0-3.541-.747-4.8-1.928a7.136 7.136 0 01-1.062-3.737c0-3.817 3.03-6.925 6.806-7.043v2.597a3.277 3.277 0 00-.865-.118c-1.732 0-3.148 1.455-3.148 3.226 0 1.062.512 2.046 1.338 2.597.433 1.22 1.613 2.124 2.95 2.124 1.732 0 3.148-1.456 3.148-3.226V1.534h2.872c.276.945.787 1.77 1.495 2.4a5.397 5.397 0 003.62 2.833z"
      />
      <g>
        <path
          fill="#00F7EF"
          d="M9.908 8.184V9.52c-3.777.118-6.806 3.226-6.806 7.043 0 1.377.393 2.636 1.062 3.738A7.122 7.122 0 012 15.148c0-3.896 3.148-7.043 7.003-7.043.315 0 .63.04.905.079z"
        />
        <path
          fill="#00F7EF"
          d="M16.203 1.534h-2.872v15.187c0 1.77-1.416 3.227-3.147 3.227-1.377 0-2.518-.866-2.951-2.125.511.354 1.14.59 1.81.59 1.73 0 3.147-1.416 3.147-3.187V0h3.817v.079c0 .157 0 .314.039.472 0 .315.079.669.157.983zM21.318 5.311v1.417c-1.574-.315-2.911-1.377-3.659-2.794a5.11 5.11 0 003.659 1.377z"
        />
      </g>
    </svg>
  )
}

