/**
 * Simple basename utility (browser-compatible)
 */
export function basename(filePath) {
  if (!filePath) return ''
  return filePath.split(/[\\/]/).pop()
}

export function extname(filePath) {
  const base = basename(filePath)
  const idx = base.lastIndexOf('.')
  return idx >= 0 ? base.slice(idx) : ''
}

export function dirname(filePath) {
  if (!filePath) return ''
  const parts = filePath.split(/[\\/]/)
  parts.pop()
  return parts.join('/')
}
