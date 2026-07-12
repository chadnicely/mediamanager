// True when the viewport is phone-width. Drives the desktop/mobile split in
// App.jsx so the same renderer serves both — resize the window to preview.

import { useEffect, useState } from 'react'

const QUERY = '(max-width: 640px)'

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
