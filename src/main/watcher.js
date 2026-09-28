import chokidar from 'chokidar'
import { basename, extname } from 'path'

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.mts', '.m2ts']

let _watcher = null

/**
 * Start watching a folder for new video files
 * @param {string} folderPath - Folder to watch
 * @param {function} onNewVideo - Callback(filePath) when new video detected
 */
export function startWatcher(folderPath, onNewVideo) {
  stopWatcher()

  _watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: false, // Process existing files at startup as well as new files
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 500
    }
  })

  _watcher.on('add', (filePath) => {
    const ext = extname(filePath).toLowerCase()
    if (VIDEO_EXTENSIONS.includes(ext)) {
      console.log(`[Watcher] New video detected: ${filePath}`)
      onNewVideo(filePath)
    }
  })

  _watcher.on('error', (err) => {
    console.error('[Watcher] Error:', err)
  })

  console.log(`[Watcher] Watching: ${folderPath}`)
  return true
}

export function stopWatcher() {
  if (_watcher) {
    _watcher.close()
    _watcher = null
    console.log('[Watcher] Stopped')
  }
}
