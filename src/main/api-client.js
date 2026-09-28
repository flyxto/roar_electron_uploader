import axios from 'axios'

/**
 * Save reel data to MongoDB via backend REST API
 * @param {object} data - { reelId, videoUrl, cloudflareUrl }
 * @param {string} apiUrl - Backend API base URL
 */
export async function saveReelToMongo(data, apiUrl) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/reels`
  const response = await axios.post(url, data, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000
  })
  return response.data
}

/**
 * Fetch all reels from backend
 */
export async function fetchReels(apiUrl) {
  const url = `${apiUrl.replace(/\/$/, '')}/api/reels`
  const response = await axios.get(url, { timeout: 10000 })
  return response.data
}
