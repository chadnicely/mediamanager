import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Register the PWA service worker only in the built/hosted web app — never in
// Electron (window.api present, file://) and never during `web:dev`, where a
// cached shell would mask live edits.
if (import.meta.env.PROD && !window.api && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
