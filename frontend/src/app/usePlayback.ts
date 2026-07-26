import { useCallback, useEffect, useState } from 'react'

import type { InferenceResult } from '../shared/api/types'

interface Options {
  frame: number
  frameCount: number
  episodeFps: number
  onFrame: (frame: number) => void
}

interface ChunkPlayback {
  startFrame: number
  length: number
  fps: number
}

export function usePlayback({ frame, frameCount, episodeFps, onFrame }: Options) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [inferenceStep, setInferenceStep] = useState(0)
  const [inferencePlaying, setInferencePlaying] = useState(false)
  const [chunk, setChunk] = useState<ChunkPlayback | null>(null)

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(
      () => {
        if (frame >= frameCount - 1) {
          setPlaying(false)
          return
        }
        onFrame(frame + 1)
      },
      1000 / episodeFps / speed,
    )
    return () => window.clearInterval(timer)
  }, [episodeFps, frame, frameCount, onFrame, playing, speed])

  useEffect(() => {
    if (!inferencePlaying || !chunk) return
    const timer = window.setInterval(() => {
      setInferenceStep((current) => {
        if (current >= chunk.length - 1) {
          setInferencePlaying(false)
          return current
        }
        return current + 1
      })
    }, 1000 / chunk.fps)
    return () => window.clearInterval(timer)
  }, [chunk, inferencePlaying])

  const seek = useCallback(
    (nextFrame: number) => {
      onFrame(Math.min(Math.max(nextFrame, 0), Math.max(frameCount - 1, 0)))
    },
    [frameCount, onFrame],
  )

  const restart = useCallback(() => seek(0), [seek])
  const previous = useCallback(() => seek(frame - 1), [frame, seek])
  const next = useCallback(() => seek(frame + 1), [frame, seek])
  const stopEpisode = useCallback(() => setPlaying(false), [])

  const startChunk = useCallback((result: InferenceResult) => {
    setChunk({
      startFrame: result.start_frame,
      length: result.chunk_size,
      fps: result.fps,
    })
    setInferenceStep(0)
    setInferencePlaying(true)
  }, [])

  const clearChunk = useCallback(() => {
    setChunk(null)
    setInferenceStep(0)
    setInferencePlaying(false)
  }, [])

  const setChunkStep = useCallback(
    (step: number) => {
      if (!chunk) return
      setInferenceStep(Math.min(Math.max(step, 0), Math.max(chunk.length - 1, 0)))
    },
    [chunk],
  )

  const reset = useCallback(
    (resetSpeed = false) => {
      setPlaying(false)
      if (resetSpeed) setSpeed(1)
      clearChunk()
    },
    [clearChunk],
  )

  const inferenceRange: [number, number] | undefined = chunk
    ? [chunk.startFrame, chunk.startFrame + chunk.length]
    : undefined

  return {
    playing,
    speed,
    inferenceStep,
    inferencePlaying,
    inferenceRange,
    setPlaying,
    setSpeed,
    setInferencePlaying,
    setChunkStep,
    seek,
    restart,
    previous,
    next,
    stopEpisode,
    startChunk,
    clearChunk,
    reset,
  }
}
