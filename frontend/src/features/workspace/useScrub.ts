import { useCallback } from 'react'
import type { PointerEvent } from 'react'

import { frameAtPosition } from './chart'

/** Pointer handlers that seek to the frame under the cursor and keep seeking while dragged. */
export function useScrub(frameCount: number, onSeek: (frame: number) => void) {
  const seekFrom = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onSeek(frameAtPosition(event.clientX, bounds, frameCount))
    },
    [frameCount, onSeek],
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      seekFrom(event)
    },
    [seekFrom],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.buttons !== 1) return
      seekFrom(event)
    },
    [seekFrom],
  )

  return { onPointerDown, onPointerMove }
}
