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

  useEffect(() => {
    if (!playing) return
    if (frame >= lastFrame) {
      setPlaying(false)
      return
    }
    if (!ready) return
    // Count decode time against the frame interval so playback stays real-time when it can.
    const interval = 1000 / Math.max(1, fps) / speed
    const delay = Math.max(0, interval - (Date.now() - lastAdvance.current))
    const timer = window.setTimeout(() => {
      lastAdvance.current = Date.now()
      onFrame(frame + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [fps, frame, lastFrame, onFrame, playing, ready, speed])

  const seek = useCallback(
    (next: number) => onFrame(Math.min(Math.max(Math.round(next), 0), lastFrame)),
    [lastFrame, onFrame],
  )

  const pause = useCallback(() => setPlaying(false), [])

  const play = useCallback(() => {
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
