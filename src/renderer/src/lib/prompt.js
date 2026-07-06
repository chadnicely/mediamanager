// Electron doesn't support window.prompt(), so we roll our own promise-based
// prompt backed by a React modal (PromptHost, mounted once in App).

let handler = null

export function registerPrompt(fn) {
  handler = fn
}

export function showPrompt(opts = {}) {
  if (!handler) return Promise.resolve(null)
  return handler(opts)
}
