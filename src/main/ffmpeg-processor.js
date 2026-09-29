import ffmpeg from 'fluent-ffmpeg'
import { join } from 'path'
import fs from 'fs'
import { createRequire } from 'module'

// Use bundled ffmpeg-static binary (works without system ffmpeg installed)
const require = createRequire(import.meta.url)
try {
  const ffmpegPath = require('ffmpeg-static')
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath)
    console.log('[FFmpeg] Using bundled binary:', ffmpegPath)
  }
} catch (e) {
  console.log('[FFmpeg] Using system ffmpeg (ffmpeg-static not found)')
}

try {
  const ffprobePath = require('ffprobe-static').path
  if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath)
    console.log('[FFmpeg] Using bundled ffprobe:', ffprobePath)
  }
} catch (e) {
  console.log('[FFmpeg] Using system ffprobe (ffprobe-static not found)')
}

/**
 * Process video: apply 9:16 portrait crop (left/right only, keep height),
 * optionally overlay a PNG frame on top, and optionally replace audio with
 * a looping background music track (original audio is discarded).
 *
 * @param {string} inputPath   - Source video file path
 * @param {string} outputPath  - Destination file path
 * @param {string|null} framePath    - Optional PNG overlay frame
 * @param {function} onProgress - Progress callback (0-100)
 * @param {string|null} bgMusicPath  - Optional MP3 background music (replaces original audio)
 * @returns {Promise<string>} - resolves with output path
 */
export function processVideo(inputPath, outputPath, framePath, onProgress, bgMusicPath) {
  return new Promise((resolve, reject) => {
    // Get video metadata first to know dimensions
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(err)

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      if (!videoStream) return reject(new Error('No video stream found'))

      const originalWidth = videoStream.width
      const originalHeight = videoStream.height

      // Target: 9:16 portrait from the original height
      // Width needed for 9:16 = height * 9 / 16
      const targetWidth = Math.floor((originalHeight * 9) / 16)
      // Make width even
      const cropWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1
      const cropHeight = originalHeight

      // Crop from center (left/right crop only)
      const cropX = Math.floor((originalWidth - cropWidth) / 2)
      const cropY = 0

      const hasBgMusic = bgMusicPath && fs.existsSync(bgMusicPath)

      let cmd = ffmpeg(inputPath)

      // Add background music as second input, looped to match video duration
      if (hasBgMusic) {
        cmd = cmd.input(bgMusicPath).inputOptions(['-stream_loop -1'])
      }

      if (framePath && fs.existsSync(framePath)) {
        // With frame overlay
        const frameInputIndex = hasBgMusic ? 2 : 1
        cmd = cmd
          .input(framePath)
          .complexFilter([
            `[0:v]crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}[cropped]`,
            `[${frameInputIndex}:v]scale=${cropWidth}:${cropHeight}[frame]`,
            `[cropped][frame]overlay=0:0[out]`
          ])

        if (hasBgMusic) {
          cmd = cmd.outputOptions(['-map [out]', '-map 1:a', '-shortest'])
        } else {
          cmd = cmd.outputOptions(['-map [out]', '-an'])
        }
      } else {
        // No frame overlay — just crop
        cmd = cmd.videoFilter(`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`)

        if (hasBgMusic) {
          cmd = cmd.outputOptions(['-map 0:v', '-map 1:a', '-shortest'])
        } else {
          cmd = cmd.outputOptions(['-an'])
        }
      }

      cmd
        .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-movflags +faststart', '-c:a aac'])
        .output(outputPath)
        .on('progress', (progress) => {
          if (onProgress && progress.percent != null) {
            onProgress(Math.min(99, Math.round(progress.percent)))
          }
        })
        .on('end', () => {
          onProgress && onProgress(100)
          resolve(outputPath)
        })
        .on('error', (err) => reject(err))
        .run()
    })
  })
}
