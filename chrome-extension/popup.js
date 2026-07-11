const $ = (id) => document.getElementById(id)
const groupInput = $('group')
const statusEl = $('status')
const connEl = $('conn')

function setStatus(text, cls = '') {
  statusEl.textContent = text
  statusEl.className = `status ${cls}`
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false })))
}

// Restore saved group; persist as the user types.
chrome.storage.local.get('group').then(({ group }) => {
  if (group) groupInput.value = group
})
groupInput.addEventListener('input', () => {
  chrome.storage.local.set({ group: groupInput.value.trim() })
})

// Show whether the Sniddy desktop app is reachable.
send({ type: 'ping-jotter' }).then((r) => {
  if (r.ok) {
    connEl.textContent = 'Sniddy connected'
    connEl.className = 'conn on'
  } else {
    connEl.textContent = 'Sniddy offline'
    connEl.className = 'conn off'
    setStatus('Sniddy isn’t running — captures will download to your computer instead.')
  }
})

function busy(on) {
  document.querySelectorAll('.cap').forEach((b) => (b.disabled = on))
}

async function run(mode, label) {
  busy(true)
  setStatus(`${label}…`)
  const r = await send({ type: mode })
  busy(false)
  if (r.ok) window.close() // the in-page result card takes over from here
  else setStatus(r.error || 'Capture failed.', 'err')
}

$('visible').addEventListener('click', () => run('capture-visible', 'Capturing visible area'))
$('full').addEventListener('click', () => run('capture-full', 'Capturing full page'))

// Region needs the popup to close so the user can drag on the page.
$('region').addEventListener('click', async () => {
  const r = await send({ type: 'capture-region' })
  if (r.ok) window.close()
  else setStatus(r.error || 'Could not start region capture.', 'err')
})
