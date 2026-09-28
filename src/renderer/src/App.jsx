import { useEffect, useState } from 'react'
import UploaderApp from './windows/UploaderApp'
import PreviewApp from './windows/PreviewApp'

function App() {
  const [windowType, setWindowType] = useState('uploader')

  useEffect(() => {
    // Detect which window this is
    const params = new URLSearchParams(window.location.search)
    const win = params.get('window')
    if (win === 'preview') {
      setWindowType('preview')
      document.title = 'ROAR Preview'
    } else {
      document.title = 'ROAR Uploader'
    }
  }, [])

  if (windowType === 'preview') return <PreviewApp />
  return <UploaderApp />
}

export default App
