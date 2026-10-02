/**
 * r2-upload-worker.mjs
 * 
 * Standalone Node.js child process for uploading to Cloudflare R2.
 * Isolated from Electron's BoringSSL and macOS LibreSSL.
 * 
 * Input (stdin): JSON with { filePath, key, settings }
 * Output (stdout): JSON with { success, publicUrl } or { success: false, error }
 */

import { S3Client } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import fs from 'fs'

const MAX_RETRIES = 4
const RETRY_DELAY_MS = 2000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function createClient(settings) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: settings.r2AccessKeyId,
      secretAccessKey: settings.r2SecretAccessKey
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED'
  })
}

async function uploadOnce(filePath, key, settings) {
  // Create a fresh client + fresh stream for each attempt
  const client = createClient(settings)
  const fileStream = fs.createReadStream(filePath)
  const fileSize = fs.statSync(filePath).size

  const upload = new Upload({
    client,
    params: {
      Bucket: settings.r2BucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'video/mp4',
      ContentLength: fileSize
    },
    queueSize: 1,          // No parallel parts — single sequential stream
    partSize: 8 * 1024 * 1024  // 8MB parts
  })

  await upload.done()

  const publicUrl = settings.r2PublicUrl.replace(/\/$/, '')
  return `${publicUrl}/${key}`
}

async function main() {
  let raw = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    raw += chunk
  }

  let params
  try {
    params = JSON.parse(raw)
  } catch (e) {
    process.stdout.write(JSON.stringify({ success: false, error: 'Invalid JSON input: ' + e.message }))
    process.exit(1)
  }

  const { filePath, key, settings } = params

  let lastError = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        const delay = RETRY_DELAY_MS * attempt
        process.stderr.write(`[R2 Worker] Retry ${attempt}/${MAX_RETRIES} for ${key} after ${delay}ms...\n`)
        await sleep(delay)
      }

      const publicUrl = await uploadOnce(filePath, key, settings)
      process.stdout.write(JSON.stringify({ success: true, publicUrl }))
      process.exit(0)

    } catch (err) {
      lastError = err
      const isSSLError = err.message && (
        err.message.includes('bad_record_mac') ||
        err.message.includes('BAD_RECORD_MAC') ||
        err.message.includes('EPIPE') ||
        err.message.includes('Broken pipe') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('SSL')
      )

      process.stderr.write(`[R2 Worker] Attempt ${attempt} failed: ${err.message}\n`)

      // Only retry on network/SSL errors, not auth/config errors
      if (!isSSLError) break
    }
  }

  process.stdout.write(JSON.stringify({ success: false, error: lastError?.message || 'Upload failed after retries' }))
  process.exit(1)
}

main()
