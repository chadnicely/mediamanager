import { useEffect, useRef, useState } from 'react'
import { getVideoThumb } from '../lib/videoThumbs.js'

// Shows a generated thumbnail IMAGE for a video (a decoded frame captured to an
// image, so it always paints). A shimmer placeholder stays up until the image is
// ready, so tiles never sit as empty black boxes. Generation is deferred until
// the tile scrolls into view, so the first page fills in first and off-screen
// videos don't compete for the decoder. Falls back to an icon if no frame can be
// captured.
export default function VideoThumb({ src, className = '', onDuration }) {
  const [state, setState] = useState({ s: 'loading' }) // 'loading' | 'ok' | 'fail'
  const [visible, setVisible] = useState(false)
  const holderRef = useRef(null)
  const onDur = useRef(onDuration)
  onDur.current = onDuration

  // Start generating only when the tile is near the viewport.
  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let alive = true
    setState({ s: 'loading' })
    getVideoThumb(src).then((res) => {
      if (!alive) return
      if (res && res.thumb) {
        setState({ s: 'ok', thumb: res.thumb })
        if (res.duration && onDur.current) onDur.current(res.duration)
      } else {
        setState({ s: 'fail' })
      }
    })
    return () => {
      alive = false
    }
  }, [visible, src])

  if (state.s === 'ok') return <img src={state.thumb} alt="" className={className} />
  if (state.s === 'fail') return <span className="result-ico">🎬</span>
  // Loading placeholder — a soft shimmer (also the element the observer watches).
  return <div ref={holderRef} className="vthumb-skel" />
}
