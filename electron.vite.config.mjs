import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'fs'

// Plugin to copy the r2-upload-worker.mjs next to the bundled main/index.js
const copyWorkerPlugin = {
  name: 'copy-r2-worker',
  closeBundle() {
    try {
      copyFileSync(
        resolve('src/main/r2-upload-worker.mjs'),
        resolve('out/main/r2-upload-worker.mjs')
      )
      console.log('[copy-r2-worker] Copied r2-upload-worker.mjs to out/main/')
    } catch (e) {
      console.warn('[copy-r2-worker] Could not copy worker:', e.message)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [copyWorkerPlugin],
    build: {
      rollupOptions: {
        // Do NOT bundle the worker - it needs to stay as a standalone .mjs file
        external: ['r2-upload-worker.mjs']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
