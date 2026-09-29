import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (partial) => ipcRenderer.invoke('update-settings', partial),

  // Folder / file pickers
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFrameImage: () => ipcRenderer.invoke('select-frame-image'),
  selectBgMusic: () => ipcRenderer.invoke('select-bg-music'),

  // Watcher
  startWatcher: (folderPath) => ipcRenderer.invoke('start-watcher', folderPath),
  stopWatcher: () => ipcRenderer.invoke('stop-watcher'),

  // Video processing pipeline
  processVideo: (filePath) => ipcRenderer.invoke('process-video', filePath),
  getJobs: () => ipcRenderer.invoke('get-jobs'),
  fetchHistory: () => ipcRenderer.invoke('fetch-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getLocalVideoUrl: (localPath) => ipcRenderer.invoke('get-local-video-url', localPath),

  // Preview window
  openPreviewWindow: () => ipcRenderer.invoke('open-preview-window'),
  sendPreviewVideo: (data) => ipcRenderer.send('preview-video', data),
  sendPreviewStatus: (data) => ipcRenderer.send('preview-status', data),
  sendPreviewControl: (data) => ipcRenderer.send('preview-control', data),

  // Event listeners
  onJobUpdate: (callback) => {
    ipcRenderer.on('job-update', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('job-update')
  },
  onNewVideoDetected: (callback) => {
    ipcRenderer.on('new-video-detected', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('new-video-detected')
  },
  onShowVideo: (callback) => {
    ipcRenderer.on('show-video', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('show-video')
  },
  onPreviewStatus: (callback) => {
    ipcRenderer.on('preview-status', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('preview-status')
  },
  onPreviewControl: (callback) => {
    ipcRenderer.on('preview-control', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('preview-control')
  },
  onAppLog: (callback) => {
    ipcRenderer.on('app-log', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('app-log')
  },
  sendAppLog: (data) => ipcRenderer.send('renderer-app-log', data),

  // Remove specific listener
  removeListener: (channel) => ipcRenderer.removeAllListeners(channel)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}

