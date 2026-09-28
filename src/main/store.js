import { app } from 'electron'
import { join } from 'path'
import fs from 'fs'

import dotenv from 'dotenv'
dotenv.config()

const STORE_FILE = join(app.getPath('userData'), 'roar-settings.json')

const DEFAULT_SETTINGS = {
  r2AccountId: process.env.R2_ACCOUNT_ID || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  r2BucketName: process.env.R2_BUCKET_NAME || '',
  r2PublicUrl: process.env.R2_PUBLIC_URL || '',
  backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:3000',
  reelBaseUrl: process.env.REEL_BASE_URL || 'https://roaradx.flyxto.com/reels',
  watchFolder: '',
  outputFolder: '',
  framePath: '',
  processedVideos: []
}

let _settings = { ...DEFAULT_SETTINGS }

export function initStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8')
      _settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } else {
      saveStore()
    }
  } catch (err) {
    console.error('Store init error:', err)
    _settings = { ...DEFAULT_SETTINGS }
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(_settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('Store save error:', err)
  }
}

export function getSettings() {
  const current = { ..._settings }
  
  // Fallback to process.env if the setting is empty
  return {
    ...current,
    r2AccountId: current.r2AccountId || process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: current.r2AccessKeyId || process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: current.r2SecretAccessKey || process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: current.r2BucketName || process.env.R2_BUCKET_NAME || '',
    r2PublicUrl: current.r2PublicUrl || process.env.R2_PUBLIC_URL || '',
    backendApiUrl: current.backendApiUrl || process.env.BACKEND_API_URL || 'http://localhost:3000',
    reelBaseUrl: current.reelBaseUrl || process.env.REEL_BASE_URL || 'https://roaradx.flyxto.com/reels'
  }
}

export function updateSettings(partial) {
  _settings = { ..._settings, ...partial }
  saveStore()
  return { ..._settings }
}
