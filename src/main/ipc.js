import { ipcMain, BrowserWindow } from 'electron'
import { join, basename, extname } from 'path'
import fs from 'fs'
import { getSettings, updateSettings } from './store'
import { processVideo } from './ffmpeg-processor'
import { uploadToR2 } from './r2-uploader'
import { saveReelToMongo } from './api-client'
import { startWatcher, stopWatcher } from './watcher'

// Track active jobs: Map<jobId, { status, progress, videoId, ... }>
const activeJobs = new Map()
let jobIdCounter = 0

function broadcastToAll(channel, data) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  })
}

/**
 * Extract the numeric reel ID from a filename.
 * e.g. "1001 copy.mp4" → "1001", "1003_take2.mp4" → "1003"
 * Only accepts numbers in the 1000–2000 range.
 * Returns null if no valid number found.
 */
function getVideoId(filePath) {
  const name = basename(filePath, extname(filePath))
  // Find the first 4-digit number in the filename
  const match = name.match(/(\d{4,})/)
  if (!match) return null
  const num = parseInt(match[1], 10)
  if (num < 1000 || num > 2000) return null
  return String(num)
}

/**
 * Full pipeline: FFmpeg → Save → R2 Upload → MongoDB
 */
async function runPipeline(filePath, getPreviewWindowFn) {
  const settings = getSettings()
  const fileName = basename(filePath)
  const videoId = getVideoId(filePath)
  const jobId = ++jobIdCounter

  // ---- Pre-flight validation ----
  if (!videoId) {
    const errJob = {
      jobId, videoId: fileName, fileName,
      status: 'error', progress: 0,
      startTime: Date.now(), cloudflareUrl: null, publicUrl: null,
      error: `Invalid filename "${fileName}". Must contain a number between 1000–2000.`
    }
    activeJobs.set(jobId, errJob)
    broadcastToAll('job-update', errJob)
    return errJob
  }

  // ---- Check for duplicate ID (already finished) ----
  const processed = getSettings().processedVideos || []
  const alreadyDone = processed.some((f) => getVideoId(f) === videoId)
  
  // ---- Check for duplicate ID (currently processing) ----
  const currentlyProcessing = Array.from(activeJobs.values()).some((j) => 
    j.videoId === videoId && ['processing', 'uploading', 'saving'].includes(j.status)
  )

  if (alreadyDone || currentlyProcessing) {
    const errJob = {
      jobId, videoId, fileName,
      status: 'error', progress: 0,
      startTime: Date.now(), cloudflareUrl: null, publicUrl: null,
      error: `Reel #${videoId} is already ${alreadyDone ? 'processed' : 'processing'}! Skipping duplicate.`
    }
    activeJobs.set(jobId, errJob)
    broadcastToAll('job-update', errJob)
    console.warn(`[Pipeline] Duplicate reel ID #${videoId} — skipping ${fileName}`)
    return errJob
  }

  const job = {
    jobId,
    videoId,
    fileName,
    status: 'processing',
    progress: 0,
    startTime: Date.now(),
    cloudflareUrl: null,
    publicUrl: null,
    error: null
  }

  activeJobs.set(jobId, job)
  broadcastToAll('job-update', job)

  try {
    // ---- Step 1: FFmpeg Processing ----
    const outputFolder = settings.outputFolder
    if (!outputFolder || !fs.existsSync(outputFolder)) {
      throw new Error('Output folder not set or does not exist')
    }

    const outputPath = join(outputFolder, `${videoId}_processed.mp4`)
    const framePath = settings.framePath || null

    await processVideo(filePath, outputPath, framePath, (percent) => {
      job.progress = Math.round(percent * 0.6) // 0–60%
      job.status = 'processing'
      activeJobs.set(jobId, { ...job })
      broadcastToAll('job-update', { ...job })
    })

    job.localPath = outputPath

    // ---- Step 2: R2 Upload ----
    job.status = 'uploading'
    job.progress = 60
    activeJobs.set(jobId, { ...job })
    broadcastToAll('job-update', { ...job })

    const r2Key = `reels/${videoId}_processed.mp4`
    const cloudflareUrl = await uploadToR2(outputPath, r2Key, settings)

    job.cloudflareUrl = cloudflareUrl
    job.progress = 85
    activeJobs.set(jobId, { ...job })
    broadcastToAll('job-update', { ...job })

    // ---- Step 3: MongoDB via backend ----
    job.status = 'saving'
    const publicUrl = `${settings.reelBaseUrl}/${videoId}`
    job.publicUrl = publicUrl

    await saveReelToMongo(
      {
        reelId: videoId,
        videoUrl: publicUrl,
        cloudflareUrl: cloudflareUrl
      },
      settings.backendApiUrl
    )

    job.status = 'done'
    job.progress = 100
    activeJobs.set(jobId, { ...job })
    broadcastToAll('job-update', { ...job })

    // Save to processed list to prevent re-processing
    const currentProcessed = getSettings().processedVideos || []
    if (!currentProcessed.includes(job.fileName)) {
      updateSettings({ processedVideos: [...currentProcessed, job.fileName] })
    }

    // ---- Step 4: Send to preview window ----
    const pw = getPreviewWindowFn()
    if (pw && !pw.isDestroyed()) {
      pw.webContents.send('show-video', {
        localPath: outputPath,
        cloudflareUrl,
        publicUrl,
        videoId
      })
    }

    return { ...job }
  } catch (err) {
    job.status = 'error'
    job.error = err.message
    activeJobs.set(jobId, { ...job })
    broadcastToAll('job-update', { ...job })
    throw err
  }
}

export function setupIpcHandlers(getPreviewWindowFn) {
  // ---- Settings ----
  ipcMain.handle('get-settings', () => getSettings())

  ipcMain.handle('update-settings', (_event, partial) => {
    const updated = updateSettings(partial)
    return updated
  })

  // ---- Watcher ----
  ipcMain.handle('start-watcher', (_event, folderPath) => {
    const settings = getSettings()
    const watchPath = folderPath || settings.watchFolder
    if (!watchPath) return { success: false, error: 'No folder path provided' }

    startWatcher(watchPath, (filePath) => {
      const fileName = basename(filePath)
      const currentSettings = getSettings()
      
      console.log(`[Watcher Check] Checking file: ${fileName}`)
      console.log(`[Watcher Check] processedVideos is:`, currentSettings.processedVideos)

      // Skip if already processed
      if (currentSettings.processedVideos?.includes(fileName)) {
        console.log(`[Watcher] Skipping already processed video: ${fileName}`)
        return
      }

      broadcastToAll('new-video-detected', { filePath })
      runPipeline(filePath, getPreviewWindowFn).catch(console.error)
    })

    // Update setting
    if (folderPath) updateSettings({ watchFolder: folderPath })
    return { success: true, path: watchPath }
  })

  ipcMain.handle('stop-watcher', () => {
    stopWatcher()
    return { success: true }
  })

  // ---- Manual upload / process ----
  ipcMain.handle('process-video', async (_event, filePath) => {
    return await runPipeline(filePath, getPreviewWindowFn)
  })

  // ---- Get all jobs ----
  ipcMain.handle('get-jobs', () => {
    return Array.from(activeJobs.values())
  })

  // ---- Fetch history from backend ----
  ipcMain.handle('fetch-history', async () => {
    const settings = getSettings()
    if (!settings.backendApiUrl) return []
    try {
      const axios = (await import('axios')).default
      const url = `${settings.backendApiUrl.replace(/\/$/, '')}/api/reels`
      const response = await axios.get(url, { timeout: 10000 })
      // Backend returns { success, data, pagination } — extract the array
      const reels = response.data?.data || []
      // Return oldest-first so the preview plays in chronological order
      const sorted = [...reels].reverse()
      // Attach local file path if the processed file exists in outputFolder
      const outputFolder = settings.outputFolder || ''
      const mappedReels = sorted.map((reel) => {
        const localFile = outputFolder
          ? join(outputFolder, `${reel.reelId}_processed.mp4`)
          : null
        const localExists = localFile && fs.existsSync(localFile)
        return {
          ...reel,
          localPath: localExists ? localFile : null
        }
      })
      console.log(`[Preview] Loaded ${mappedReels.length} history items. First item localPath: ${mappedReels[0]?.localPath || 'NULL'}`)
      return mappedReels
    } catch (err) {
      console.error('Fetch history error:', err.message)
      return []
    }
  })

  // ---- Clear History ----
  ipcMain.handle('clear-history', async () => {
    try {
      // 1. Clear local processed array
      updateSettings({ processedVideos: [] })
      console.log('Local processedVideos cleared')

      // 2. Clear backend MongoDB
      const settings = getSettings()
      if (settings.backendApiUrl) {
        const axios = (await import('axios')).default
        const url = `${settings.backendApiUrl.replace(/\/$/, '')}/api/reels`
        // We will send a DELETE request to clear all if the backend supports it.
        // Actually, let's just make a loop to delete them all one by one if no bulk endpoint exists
        const response = await axios.get(url, { timeout: 10000 })
        const reels = response.data?.data || []
        for (const reel of reels) {
          await axios.delete(`${url}/${reel.reelId}`).catch(() => {})
        }
        console.log('Backend history cleared')
      }
      return { success: true }
    } catch (err) {
      console.error('Clear history error:', err.message)
      return { success: false, error: err.message }
    }
  })

  // ---- Preview control ----
  ipcMain.on('preview-video', (_event, data) => {
    const pw = getPreviewWindowFn()
    if (pw && !pw.isDestroyed()) {
      pw.webContents.send('show-video', data)
    }
  })

  ipcMain.on('preview-status', (_event, data) => {
    // broadcast to dashboard (which is usually mainWindow)
    broadcastToAll('preview-status', data)
  })

  ipcMain.on('preview-control', (_event, data) => {
    const pw = getPreviewWindowFn()
    if (pw && !pw.isDestroyed()) {
      pw.webContents.send('preview-control', data)
    }
  })

  // ---- Open video file directly from local path ----
  ipcMain.handle('get-local-video-url', (_event, localPath) => {
    // Convert local path to file:// URL
    return `file://${localPath}`
  })

  // ---- Manual select and process video ----
  ipcMain.handle('select-and-process-video', async (_event, filePath) => {
    return await runPipeline(filePath, getPreviewWindowFn)
  })

  // ---- Renderer Logger ----
  ipcMain.on('renderer-app-log', (_event, data) => {
    broadcastToAll('app-log', {
      type: data.type || 'info',
      message: `[PreviewApp] ${data.message}`,
      timestamp: Date.now()
    })
  })
}
