import fs from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import axios from 'axios'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

/**
 * Downloads a video from Cloudflare R2 to targetPath.
 * First attempts a direct HTTP stream download from downloadUrl.
 * If that fails and R2 credentials are configured, falls back to AWS S3 SDK GetObjectCommand.
 */
async function downloadFile(downloadUrl, s3Key, targetPath, settings) {
  const tempPath = `${targetPath}.tmp`

  // Remove leftover temporary file if present
  if (fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath)
    } catch (_) {}
  }

  let downloadSuccess = false
  let lastError = null

  // 1. Direct HTTP GET stream
  if (downloadUrl) {
    try {
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })

      if (response.status === 200) {
        const writer = fs.createWriteStream(tempPath)
        await pipeline(response.data, writer)

        const stat = fs.statSync(tempPath)
        if (stat.size > 0) {
          downloadSuccess = true
        } else {
          throw new Error('Downloaded file is empty (0 bytes)')
        }
      } else {
        throw new Error(`HTTP status ${response.status}`)
      }
    } catch (err) {
      lastError = err
      console.warn(`[Sync] HTTP download failed for ${downloadUrl}: ${err.message}`)
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath) } catch (_) {}
      }
    }
  }

  // 2. Fallback to S3 Client GetObjectCommand if credentials exist
  if (!downloadSuccess && settings.r2AccountId && settings.r2AccessKeyId && settings.r2SecretAccessKey && settings.r2BucketName) {
    try {
      console.log(`[Sync] Attempting S3 GetObject download for key: ${s3Key}`)
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: settings.r2AccessKeyId,
          secretAccessKey: settings.r2SecretAccessKey
        }
      })

      const command = new GetObjectCommand({
        Bucket: settings.r2BucketName,
        Key: s3Key
      })

      const s3Response = await s3Client.send(command)
      const writer = fs.createWriteStream(tempPath)
      await pipeline(s3Response.Body, writer)

      const stat = fs.statSync(tempPath)
      if (stat.size > 0) {
        downloadSuccess = true
      } else {
        throw new Error('S3 downloaded file is empty (0 bytes)')
      }
    } catch (err) {
      lastError = err
      console.error(`[Sync] S3 fallback download failed for ${s3Key}:`, err.message)
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath) } catch (_) {}
      }
    }
  }

  if (!downloadSuccess) {
    throw lastError || new Error('Download failed: No valid download URL or credentials')
  }

  // Rename .tmp to final target file
  fs.renameSync(tempPath, targetPath)
  return targetPath
}

class SyncManager {
  constructor() {
    this.downloadQueue = []
    this.isProcessing = false
    this.currentlyDownloadingId = null
    this.onDownloadedCallback = null
  }

  setDownloadedCallback(callback) {
    this.onDownloadedCallback = callback
  }

  clearQueue() {
    this.downloadQueue = []
    this.currentlyDownloadingId = null
    console.log('[Sync] Download queue cleared.')
  }

  /**
   * Enqueue reels that exist in DB but are missing from local outputFolder
   */
  enqueueMissingReels(reels, settings) {
    const outputFolder = settings.outputFolder
    if (!outputFolder || !fs.existsSync(outputFolder)) {
      console.warn('[Sync] Cannot sync reels: Output folder is not configured or does not exist.')
      return
    }

    let addedCount = 0

    for (const reel of reels) {
      if (!reel.reelId) continue
      const targetPath = join(outputFolder, `${reel.reelId}_processed.mp4`)

      // If file already exists locally and has non-zero size, skip
      if (fs.existsSync(targetPath)) {
        try {
          if (fs.statSync(targetPath).size > 0) continue
        } catch (_) {}
      }

      // Check if already in queue or currently downloading
      const isAlreadyQueued = this.downloadQueue.some((item) => String(item.reelId) === String(reel.reelId))
      const isCurrentlyDownloading = String(this.currentlyDownloadingId) === String(reel.reelId)

      if (!isAlreadyQueued && !isCurrentlyDownloading) {
        const s3Key = `reels/${reel.reelId}_processed.mp4`
        let downloadUrl = reel.cloudflareUrl
        if (!downloadUrl && settings.r2PublicUrl) {
          downloadUrl = `${settings.r2PublicUrl.replace(/\/$/, '')}/${s3Key}`
        }

        this.downloadQueue.push({
          reelId: String(reel.reelId),
          downloadUrl,
          s3Key,
          targetPath,
          videoUrl: reel.videoUrl,
          cloudflareUrl: reel.cloudflareUrl
        })
        addedCount++
      }
    }

    if (addedCount > 0) {
      console.log(`[Sync] Enqueued ${addedCount} missing reel(s) for background download. Total in queue: ${this.downloadQueue.length}`)
      this.processQueue(settings)
    }
  }

  async processQueue(settings) {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.downloadQueue.length > 0) {
      const item = this.downloadQueue.shift()
      this.currentlyDownloadingId = item.reelId

      // Double-check if the file appeared in the meantime
      if (fs.existsSync(item.targetPath)) {
        try {
          if (fs.statSync(item.targetPath).size > 0) {
            this.currentlyDownloadingId = null
            continue
          }
        } catch (_) {}
      }

      console.log(`[Sync] Downloading missing Reel #${item.reelId} in background...`)

      try {
        await downloadFile(item.downloadUrl, item.s3Key, item.targetPath, settings)
        console.log(`[Sync] Successfully downloaded Reel #${item.reelId} to local folder: ${item.targetPath}`)

        if (this.onDownloadedCallback) {
          this.onDownloadedCallback({
            reelId: item.reelId,
            localPath: item.targetPath,
            videoUrl: item.videoUrl,
            cloudflareUrl: item.cloudflareUrl
          })
        }
      } catch (err) {
        console.error(`[Sync] Error downloading Reel #${item.reelId}:`, err.message)
      } finally {
        this.currentlyDownloadingId = null
      }

      // Small pause between downloads to avoid disk/network contention
      await new Promise((r) => setTimeout(r, 1000))
    }

    this.isProcessing = false
  }
}

export const syncManager = new SyncManager()
