// Offscreen audio player — extension pages aren't subject to the autoplay
// policy, so the shutter always sounds (pages the user never clicked block it).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'play-shutter') {
    const a = new Audio(chrome.runtime.getURL('shutter.wav'))
    a.volume = 0.65
    a.play().catch(() => {})
  }
})
