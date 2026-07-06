import { useEffect, useRef, useState } from 'react'
import { registerPrompt } from '../lib/prompt.js'

// Renders a modal text prompt on demand. showPrompt() resolves with the entered
// string, or null if cancelled.
export default function PromptHost() {
  const [state, setState] = useState(null) // { message, placeholder, value, resolve }
  const inputRef = useRef(null)

  useEffect(() => {
    registerPrompt(
      (opts) =>
        new Promise((resolve) =>
          setState({
            message: opts.message || 'Enter a value',
            placeholder: opts.placeholder || '',
            value: opts.defaultValue || '',
            resolve
          })
        )
    )
  }, [])

  useEffect(() => {
    if (state) setTimeout(() => inputRef.current?.focus(), 0)
  }, [state])

  if (!state) return null

  const close = (val) => {
    state.resolve(val)
    setState(null)
  }
  const submit = () => close(state.value.trim() || null)

  return (
    <div className="modal-backdrop" onMouseDown={() => close(null)}>
      <div className="modal prompt-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="prompt-msg">{state.message}</div>
        <input
          ref={inputRef}
          className="dest-input"
          value={state.value}
          placeholder={state.placeholder}
          onChange={(e) => setState((s) => ({ ...s, value: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') close(null)
          }}
        />
        <div className="modal-actions">
          <button className="btn-ghost" onClick={() => close(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
