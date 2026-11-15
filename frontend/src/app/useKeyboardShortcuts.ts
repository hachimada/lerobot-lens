import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'

import type { ShortcutAction } from '../features/workspace/shortcuts'
import { shortcutForEvent } from '../features/workspace/shortcuts'

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
