import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import roaradxWhiteLogo from '../assets/roaradx-white-logo.svg'
import './PreviewApp.css'

// Deterministic mock TikTok interactions based on videoId (like in tik-tok-kiosk)
function getInteractions(videoId) {
  if (!videoId) return { likes: '8.4k', comments: '124' }
  let hash = 0
  const str = String(videoId)
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  const abs = Math.abs(hash)
  const likesRaw = (abs % 9000) + 1200
  const likes = (likesRaw / 1000).toFixed(1) + 'k'
  const comments = (abs % 450) + 24
  return { likes, comments }
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
  const [targetIndex, setTargetIndex] = useState(0)
  const [priorityVersion, setPriorityVersion] = useState(0)
  const [activeSlot, setActiveSlot] = useState(0) // 0 for Slot A, 1 for Slot B
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const priorityQueueRef = useRef([])
  const resumeIndexRef = useRef(null)

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

  // Determine the next video in line: priority downloaded videos play next once, then regular loop resumes
  const getNextTarget = (curIdx, curQueue) => {
    if (!curQueue || curQueue.length === 0) return { nextIndex: 0, isPriority: false }

    if (priorityQueueRef.current.length > 0) {
      const pId = priorityQueueRef.current[0]
      const idx = curQueue.findIndex((v) => String(v.videoId) === String(pId))
      if (idx !== -1) {
        return { nextIndex: idx, isPriority: true, priorityId: pId }
      }
    }

    if (resumeIndexRef.current !== null) {
      const rIdx = resumeIndexRef.current % curQueue.length
      return { nextIndex: rIdx, isResume: true }
    }

    return { nextIndex: (curIdx + 1) % curQueue.length, isPriority: false }
  }

  // The displayed video for QR & details updates immediately when transition begins
  const displayedIndex = isTransitioning ? targetIndex : currentIndex
  const displayedVideo = queue.length > 0 ? queue[displayedIndex] : null

  const curVideo = queue[currentIndex] || null
  const upcomingTarget = getNextTarget(currentIndex, queue)
  const nextVideo = queue.length > 0 ? queue[upcomingTarget.nextIndex] : null
  const videoSlot0 = activeSlot === 0 ? curVideo : nextVideo
  const videoSlot1 = activeSlot === 1 ? curVideo : nextVideo

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

        if (prev.length > 0) {
          // Play newly downloaded video right after current video completely finishes (Option 1)
          if (!priorityQueueRef.current.includes(data.videoId)) {
            priorityQueueRef.current.push(data.videoId)
          }
          setPriorityVersion((v) => v + 1)
        } else {
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

    const target = getNextTarget(currentIndexRef.current, curQueue)
    setTargetIndex(target.nextIndex)
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
    const target = getNextTarget(currentIndexRef.current, curQueue)
    const nextCurIndex = target.nextIndex

    if (target.isPriority) {
      // Save where normal playlist was heading so it resumes cleanly after priority video
      if (resumeIndexRef.current === null) {
        resumeIndexRef.current = (currentIndexRef.current + 1) % curQueue.length
      }
      priorityQueueRef.current = priorityQueueRef.current.filter((id) => String(id) !== String(target.priorityId))
      setPriorityVersion((v) => v + 1)
    } else if (target.isResume) {
      // Resumed back to regular playlist; clear resume pointer
      resumeIndexRef.current = null
    }

    // Pause outgoing video that is now off-screen
    const outgoingRef = currentSlot === 0 ? videoRefA.current : videoRefB.current
    if (outgoingRef) {
      outgoingRef.pause()
      outgoingRef.muted = true
    }

    // Preload next upcoming video into the outgoing slot
    const upcomingTarget = getNextTarget(nextCurIndex, curQueue)
    const upcomingReel = curQueue[upcomingTarget.nextIndex]
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
    const nextTarget = getNextTarget(currentIndex, queue)
    const nxt = queue[nextTarget.nextIndex]

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
  }, [queue.length, queue[currentIndex]?.videoId, priorityVersion])

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
          priorityQueueRef.current = []
          resumeIndexRef.current = null
          setCurrentIndex((prev) => (prev - 1 + queue.length) % queue.length)
        } else if (control.action === 'play-id') {
          const index = queue.findIndex((v) => String(v.videoId) === String(control.value))
          if (index !== -1) {
            priorityQueueRef.current = []
            resumeIndexRef.current = null
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
            <div className="preview-layout">
              {/* Video Player (TikTok-style Vertical Feed Scroll) */}
              <div className="preview-stage">
                <div
                  className="tiktok-feed-viewport"
                  onClick={() => startScrollTransition()}
                  title="Click to scroll to next video"
                >
                  <div
                    className={`tiktok-slot-card ${getSlotClass(0)}`}
                    onTransitionEnd={handleTransitionEnd}
                  >
                    <video
                      ref={videoRefA}
                      className="tiktok-video-item"
                      onEnded={() => {
                        if (activeSlot === 0 && !isTransitioning) startScrollTransition()
                      }}
                      onError={() => {
                        if (activeSlot === 0 && !isTransitioning) setTimeout(startScrollTransition, 1500)
                      }}
                      playsInline
                      autoPlay
                    />
                    <TikTokVideoOverlay videoData={videoSlot0} />
                  </div>

                  <div
                    className={`tiktok-slot-card ${getSlotClass(1)}`}
                    onTransitionEnd={handleTransitionEnd}
                  >
                    <video
                      ref={videoRefB}
                      className="tiktok-video-item"
                      onEnded={() => {
                        if (activeSlot === 1 && !isTransitioning) startScrollTransition()
                      }}
                      onError={() => {
                        if (activeSlot === 1 && !isTransitioning) setTimeout(startScrollTransition, 1500)
                      }}
                      playsInline
                    />
                    <TikTokVideoOverlay videoData={videoSlot1} />
                  </div>
                </div>
              </div>

              {/* Promo Details & QR Code Under the Video (Text Left, QR Right) */}
              <div className="promo-section">
                {/* Left: Text & Hashtags */}
                <div className="promo-text-col">
                  <h2 className="promo-title">
                    Scan, Share & Win
                  </h2>

                  <div className="promo-sub-block">
                    <div className="promo-sub-row">
                      <span>Tag</span>
                      <TikTokLogo className="inline-tiktok-icon" />
                      <span className="promo-tag-handle">@roar.adx</span>
                    </div>

                    <div className="promo-sub-row">
                      <span className="promo-use-label">Use</span>
                      <span className="promo-hashtag">#DigitalSummitAsia</span>
                      <span className="promo-hashtag">#DMASLSummit2026</span>
                    </div>
                  </div>
                </div>

                {/* Right: QR Code Card */}
                {qrDataUrl && (
                  <div className="promo-qr-card">
                    <img
                      src={qrDataUrl}
                      alt="QR Code"
                      className="promo-qr-image"
                    />
                    <div className="promo-reel-id">
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
              <p className="idle-title">Get Ready</p>
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

function TikTokVideoOverlay({ videoData }) {
  if (!videoData) return null

  const { likes, comments } = getInteractions(videoData.videoId)

  return (
    <div className="tiktok-video-overlay">
      {/* Dark vignette scrim gradient at the bottom for text contrast */}
      <div className="tiktok-overlay-scrim" />

      <div className="tiktok-overlay-content">
        {/* Left Column: Roar ADX White Logo, handle, event caption, sound marquee */}
        <div className="tiktok-meta-col">
          <img
            src={roaradxWhiteLogo}
            alt="Roar ADX"
            className="tiktok-brand-logo"
          />
          <div className="tiktok-handle-row">
            <span className="tiktok-handle">@roaradx</span>
          </div>
          <p className="tiktok-caption">I was here at Digital Summit Asia</p>
          <p className="tiktok-hashtags">#roaradx #DMASLSummit2026</p>

          <div className="tiktok-sound-row">
            <svg
              className="tiktok-music-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <div className="tiktok-marquee-viewport">
              <div className="tiktok-marquee-track">
                <span className="tiktok-marquee-text">original sound - roaradx ♫</span>
                <span className="tiktok-marquee-text">original sound - roaradx ♫</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Like, Comment, Share, Spinning Vinyl Record */}
        <div className="tiktok-actions-col">
          {/* Like Heart */}
          <div className="tiktok-action-item">
            <div className="tiktok-action-icon-wrap">
              <svg className="tiktok-action-icon" viewBox="0 0 512 512" fill="currentColor">
                <path d="M462.3 62.6C407.5 15.9 326 24.3 275.7 76.2L256 96.5l-19.7-20.3C186.1 24.3 104.5 15.9 49.7 62.6c-62.8 53.6-66.1 149.8-9.9 207.9l193.5 199.8c12.5 12.9 32.8 12.9 45.3 0l193.5-199.8c56.3-58.1 53-154.3-9.8-207.9z" />
              </svg>
            </div>
            <span className="tiktok-action-label">{likes}</span>
          </div>

          {/* Comment Bubble */}
          <div className="tiktok-action-item">
            <div className="tiktok-action-icon-wrap">
              <svg className="tiktok-action-icon" viewBox="0 0 512 512" fill="currentColor">
                <path d="M256 32C114.6 32 0 125.1 0 240c0 49.6 21.4 95 57 130.7C44.5 421.1 2.7 466 2.2 466.5c-2.2 2.3-2.8 5.7-1.5 8.7S4.8 480 8 480c66.3 0 116-31.8 140.6-51.4 32.7 12.3 69 19.4 107.4 19.4 141.4 0 256-93.1 256-208S397.4 32 256 32zM128 272c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 0c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 0c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z" />
              </svg>
            </div>
            <span className="tiktok-action-label">{comments}</span>
          </div>

          {/* Share */}
          <div className="tiktok-action-item">
            <div className="tiktok-action-icon-wrap">
              <svg className="tiktok-action-icon" viewBox="0 0 512 512" fill="currentColor">
                <path d="M448 240L296 88v96C112 184 64 304 64 424c48-64 112-96 232-96v96l152-152z" />
              </svg>
            </div>
            <span className="tiktok-action-label">share</span>
          </div>

          {/* Spinning Vinyl Record */}
          <div className="tiktok-vinyl-disc animate-spin-slow">
            <div className="tiktok-vinyl-hub" />
          </div>
        </div>
      </div>
    </div>
  )
}


