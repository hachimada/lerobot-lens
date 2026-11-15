import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  frame: number
  frameCount: number
  fps: number
  /** Playback rate; 1 is real time. */
  speed?: number
  onFrame: (frame: number) => void
  /** Whether the current frame is on screen; playback waits for it before advancing. */
  ready?: boolean
}

/**
 * Episode playback. It is frame-locked: it advances only once the current
 * frame has been decoded and shown, so slow decoding slows playback instead of
 * skipping frames or letting the robot model run ahead of the camera.
 */
export function usePlayback({ frame, frameCount, fps, speed = 1, onFrame, ready = true }: Options) {
  const [playing, setPlaying] = useState(false)
  const lastFrame = Math.max(0, frameCount - 1)
  const frameRef = useRef(frame)
  frameRef.current = frame
  const lastAdvance = useRef(0)
  // Bumped by every seek, play, and pause, so a frame timer scheduled before
  // one of them cannot undo it when it fires ahead of the next render.
  const changes = useRef(0)

  useEffect(() => {
    if (!playing || frame >= lastFrame || !ready) return
    // Count decode time against the frame interval so playback stays real-time when it can.
    const interval = 1000 / Math.max(1, fps) / speed
    const delay = Math.max(0, interval - (Date.now() - lastAdvance.current))
    const scheduled = changes.current
    const timer = window.setTimeout(() => {
      if (changes.current !== scheduled) return
      lastAdvance.current = Date.now()
      // Stop with the last frame, rather than in an effect that could run after a newer change.
      if (frame + 1 >= lastFrame) setPlaying(false)
      onFrame(frame + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [fps, frame, lastFrame, onFrame, playing, ready, speed])

  const seek = useCallback(
    (next: number) => {
      changes.current += 1
      const target = Math.min(Math.max(Math.round(next), 0), lastFrame)
      if (target >= lastFrame) setPlaying(false)
      onFrame(target)
    },
    [lastFrame, onFrame],
  )

  const pause = useCallback(() => {
    changes.current += 1
    setPlaying(false)
  }, [])

  const play = useCallback(() => {
    changes.current += 1
    // A single-frame episode has nothing to play.
    if (lastFrame === 0) return
    if (frameRef.current >= lastFrame) onFrame(0)
    lastAdvance.current = Date.now()
    setPlaying(true)
  }, [lastFrame, onFrame])

  const toggle = useCallback(() => {
    if (playing) pause()
    else play()
  }, [pause, play, playing])

  const step = useCallback(
    (delta: number) => {
      pause()
      seek(frameRef.current + delta)
    },
    [pause, seek],
  )

  return { playing, play, pause, toggle, seek, step }
}
