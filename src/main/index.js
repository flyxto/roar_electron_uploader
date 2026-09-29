import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { setupIpcHandlers } from './ipc'
import { initStore } from './store'

// ---- Global Console Logger Interceptor ----
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

function broadcastLog(type, ...args) {
  const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('app-log', { type, message, timestamp: Date.now() })
    }
  })
}

console.log = (...args) => {
  originalConsoleLog(...args)
  broadcastLog('info', ...args)
}
console.error = (...args) => {
  originalConsoleError(...args)
  broadcastLog('error', ...args)
}
console.warn = (...args) => {
  originalConsoleWarn(...args)
  broadcastLog('warn', ...args)
}
// -------------------------------------------


let mainWindow = null
let previewWindow = null

export function getMainWindow() {
  return mainWindow
}

export function getPreviewWindow() {
  return previewWindow
}

export function createPreviewWindow() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.focus()
    return previewWindow
  }

  previewWindow = new BrowserWindow({
    width: 500,
    height: 960,
    minWidth: 400,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    title: 'ROAR Preview',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  previewWindow.on('ready-to-show', () => {
    previewWindow.show()
  })

  previewWindow.on('closed', () => {
    previewWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    previewWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=preview')
  } else {
    previewWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'preview' }
    })
  }

  return previewWindow
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0f',
    title: 'ROAR Uploader',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.roar.uploader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize persistent store
  initStore()

  // Setup all IPC handlers
  setupIpcHandlers(getPreviewWindow)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Open Preview Window
ipcMain.handle('open-preview-window', () => {
  createPreviewWindow()
  return true
})

// Open folder picker dialog
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Open file picker for frame overlay image
ipcMain.handle('select-frame-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Open file picker for background music MP3
ipcMain.handle('select-bg-music', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'aac', 'wav', 'm4a', 'ogg'] }]
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// Forward video to preview window
ipcMain.on('preview-video', (_event, data) => {
  const pw = getPreviewWindow()
  if (pw && !pw.isDestroyed()) {
    pw.webContents.send('show-video', data)
  }
})
