import { useEffect } from 'react'

export default function Lightbox({ items, index, onIndex, onClose }) {
  const current = items[index]

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') onIndex((index + 1) % items.length)
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onIndex, onClose])

  // Preload the neighbors so flipping feels instant.
  useEffect(() => {
    ;[index + 1, index - 1].forEach((i) => {
      const it = items[(i + items.length) % items.length]
      if (it?.url) {
        const img = new Image()
        img.src = it.url
      }
    })
  }, [index, items])

  if (!current) return null

  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lb-close" onClick={onClose} title="Close (Esc)">
        ×
      </button>

      <button
        className="lb-nav lb-prev"
        onClick={(e) => {
          e.stopPropagation()
          onIndex((index - 1 + items.length) % items.length)
        }}
        title="Previous (←)"
      >
        ‹
      </button>

      <figure className="lb-figure" onClick={(e) => e.stopPropagation()}>
        <img src={current.url} alt={current.name} />
        <figcaption>
          {current.name} · {index + 1} / {items.length}
        </figcaption>
      </figure>

      <button
        className="lb-nav lb-next"
        onClick={(e) => {
          e.stopPropagation()
          onIndex((index + 1) % items.length)
        }}
        title="Next (→)"
      >
        ›
      </button>
    </div>
  )
}
