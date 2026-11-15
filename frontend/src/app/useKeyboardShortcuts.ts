import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'

export type ShortcutAction =
  | 'toggle-play'
  | 'previous-frame'
  | 'next-frame'
  | 'back-10'
  | 'forward-10'
  | 'first-frame'
  | 'last-frame'
  | 'previous-episode'
  | 'next-episode'
  | 'probe'
  | 'replay'
  | 'remove-probe'
  | 'escape'
  | 'help'

export interface ShortcutDescription {
  keys: string[]
  label: string
}

export const SHORTCUTS: ShortcutDescription[] = [
  { keys: ['Space'], label: 'Play or pause' },
  { keys: ['←', '→'], label: 'Previous or next frame (chunk step while a probe is on the stage)' },
  { keys: ['Shift', '←/→'], label: 'Jump 10 frames or steps' },
  { keys: ['Home', 'End'], label: 'First or last frame or step' },
  { keys: ['[', ']'], label: 'Previous or next episode' },
  { keys: ['I'], label: 'Probe the policy at this frame' },
  { keys: ['R'], label: 'Play the selected chunk on the stage' },
  { keys: ['Delete'], label: 'Remove the selected probe' },
  { keys: ['Esc'], label: 'Show the recording on the stage, or close dialogs' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
]

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function shortcutForEvent(event: KeyboardEvent): ShortcutAction | null {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return null
  const target = event.target
  if (target instanceof HTMLElement && (EDITABLE.has(target.tagName) || target.isContentEditable)) {
    return event.key === 'Escape' ? 'escape' : null
  }
  if (target instanceof HTMLButtonElement && (event.key === ' ' || event.key === 'Enter')) {
    // A button focused from the keyboard keeps its native activation keys.
    return null
  }
  switch (event.key) {
    case ' ':
      return 'toggle-play'
    case 'ArrowLeft':
      return event.shiftKey ? 'back-10' : 'previous-frame'
    case 'ArrowRight':
      return event.shiftKey ? 'forward-10' : 'next-frame'
    case 'Home':
      return 'first-frame'
    case 'End':
      return 'last-frame'
    case '[':
      return 'previous-episode'
    case ']':
      return 'next-episode'
    case 'i':
    case 'I':
      return 'probe'
    case 'r':
    case 'R':
      return 'replay'
    case 'Delete':
    case 'Backspace':
      return 'remove-probe'
    case 'Escape':
      return 'escape'
    case '?':
      return 'help'
    default:
      return null
  }
}

/**
 * For a container's onMouseDown: clicked buttons do not take focus, so Space
 * and Enter keep driving the shortcuts instead of clicking the last button
 * again. Buttons reached with Tab still get focus and their native keys.
 */
export function keepFocusOffButtons(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('button')) event.preventDefault()
}

/** Calls `onShortcut` for workspace keys; while disabled, keys keep their default behavior. */
export function useKeyboardShortcuts(onShortcut: (action: ShortcutAction) => void, enabled = true) {
  const handler = useRef(onShortcut)
  useEffect(() => {
    handler.current = onShortcut
  })

  useEffect(() => {
    if (!enabled) return
    const listener = (event: KeyboardEvent) => {
      const action = shortcutForEvent(event)
      if (!action) return
      event.preventDefault()
      handler.current(action)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [enabled])
}
