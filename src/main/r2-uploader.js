import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Serial upload queue - only ONE upload runs at a time to avoid overwhelming
// Cloudflare R2 with concurrent TLS connections which triggers bad_record_mac
let uploadQueue = Promise.resolve()

/**
 * Upload a file to Cloudflare R2 by spawning a standalone Node.js child process.
 * 
 * Runs uploads serially to prevent concurrent TLS connection issues with Cloudflare R2.
 * 
 * @param {string} filePath - Local path to file
 * @param {string} key - Object key (path) in R2 bucket
 * @param {object} settings - R2 settings
 * @returns {Promise<string>} - Public URL
 */
export async function uploadToR2(filePath, key, settings) {
  // Chain onto the existing queue — never run two uploads simultaneously
  const result = uploadQueue.then(() => runWorker(filePath, key, settings))
  uploadQueue = result.catch(() => {}) // prevent unhandled rejection stopping the queue
  return result
}

function runWorker(filePath, key, settings) {
  return new Promise((resolve, reject) => {
    const workerScript = path.join(__dirname, 'r2-upload-worker.mjs')

    if (!fs.existsSync(workerScript)) {
      return reject(new Error(`Upload worker not found at: ${workerScript}`))
    }

    const nodeBin = '/opt/homebrew/bin/node'

    // Build a clean environment — strip ALL Electron-specific vars that could
    // interfere with Node's OpenSSL or cause it to behave like an Electron process
    const cleanEnv = {}
    const STRIP_KEYS = new Set([
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_NO_ASAR',
      'ELECTRON_OVERRIDE_DIST_PATH',
      'ATOM_SHELL_INTERNAL_RUN_AS_NODE',
      'GOOGLE_API_KEY',
    ])
    for (const [k, v] of Object.entries(process.env)) {
      if (!STRIP_KEYS.has(k)) {
        cleanEnv[k] = v
      }
    }

    // Force TLS 1.2 maximum for Node's OpenSSL to avoid the TLS 1.3
    // CHACHA20-POLY1305 cipher bug with Cloudflare R2 on macOS
    cleanEnv['NODE_OPTIONS'] = ((cleanEnv['NODE_OPTIONS'] || '') + ' --tls-max-v1.2').trim()

    const worker = spawn(nodeBin, [workerScript], {
      cwd: path.join(__dirname, '..', '..'),
      env: cleanEnv
    })

    const payload = JSON.stringify({ filePath, key, settings })
    worker.stdin.write(payload)
    worker.stdin.end()

    let stdout = ''
    let stderr = ''

    worker.stdout.on('data', (d) => { stdout += d.toString() })
    worker.stderr.on('data', (d) => { stderr += d.toString() })

    worker.on('close', (code) => {
      if (stderr) {
        console.log('[R2 Worker] stderr:', stderr.trim())
      }

      let result
      try {
        result = JSON.parse(stdout.trim())
      } catch (e) {
        return reject(new Error(`Worker returned invalid JSON (code ${code}): ${stdout} | ${stderr}`))
      }

      if (result.success) {
        resolve(result.publicUrl)
      } else {
        reject(new Error(result.error || 'Upload worker failed'))
      }
    })

    worker.on('error', (err) => {
      reject(new Error(`Failed to spawn upload worker: ${err.message}`))
    })
  })
}
