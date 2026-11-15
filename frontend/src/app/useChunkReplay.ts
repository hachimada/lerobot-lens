import { useCallback, useEffect, useRef, useState } from 'react'

import { chunkAt, stepAt } from '../features/workspace/probes'

/** A chunk on the episode's time axis. */
interface ChunkSpan {
  id: string
  startFrame: number
  endFrame: number
}

/** What the stage plays: an episode frame, within one chunk or through all of them. */
export interface ChunkReplay {
  /** The episode frame on the stage. */
  frame: number
  playing: boolean
  /** The chunk played on its own; null while playing through the episode's chunks. */
  pinned: string | null
}

/**
 * The chunk and step a replay shows. Through the episode, each frame shows the
 * chunk inferred from the latest observation so far (see chunkAt).
 */
export function chunkOnStage<T extends ChunkSpan>(
  replay: ChunkReplay | null,
  chunks: T[],
): { chunk: T; step: number } | null {
  if (!replay) return null
  const chunk =
    replay.pinned === null
      ? chunkAt(chunks, replay.frame)?.chunk
      : chunks.find((candidate) => candidate.id === replay.pinned)
  const step = chunk ? stepAt(chunk, replay.frame) : null
  return chunk && step !== null ? { chunk, step } : null
}

/**
 * The frame a replay shows next, or null at its end: the pinned chunk's last
 * step, or the episode's last chunk. Through the episode, gaps between chunks
 * are skipped.
 */
export function nextFrame(replay: ChunkReplay, chunks: ChunkSpan[]): number | null {
  const frame = replay.frame + 1
  if (replay.pinned !== null) {
    const chunk = chunks.find((candidate) => candidate.id === replay.pinned)
    return chunk && frame < chunk.endFrame ? frame : null
  }
  const found = chunkAt(chunks, frame)
  return found ? found.chunk.startFrame + found.step : null
}

/**
 * Plays predicted action chunks on the stage: one chunk to its end, or the
 * episode's chunks frame by frame.
 *
 * The camera stays on the chunk's input frame while this runs: a chunk holds
 * commands, which the recorded video does not show at the same moments, so the
 * meaningful comparison is predicted against recorded actions, step by step.
 */
export function useChunkReplay(stepsPerSecond: number, chunks: ChunkSpan[]) {
  const [replay, setReplay] = useState<ChunkReplay | null>(null)
  const chunksRef = useRef(chunks)
  useEffect(() => {
    chunksRef.current = chunks
  })
  // The latest replay requested, ahead of React's render: a frame timer that
  // fires after a newer change (leaving, pausing, seeking) must not undo it.
  const latest = useRef<ChunkReplay | null>(null)
  const update = useCallback((next: ChunkReplay | null) => {
    latest.current = next
    setReplay(next)
  }, [])

  useEffect(() => {
    if (!replay?.playing) return
    const timer = window.setTimeout(
      () => {
        if (latest.current !== replay) return
        const frame = nextFrame(replay, chunksRef.current)
        update(frame === null ? { ...replay, playing: false } : { ...replay, frame })
      },
      1000 / Math.max(1, stepsPerSecond),
    )
    return () => window.clearTimeout(timer)
  }, [replay, stepsPerSecond, update])

  /** Show a frame of one chunk (`pinned`), or of the episode's chunks (null). */
  const open = useCallback(
    (pinned: string | null, frame: number, playing: boolean) => update({ pinned, frame, playing }),
    [update],
  )

  const exit = useCallback(() => update(null), [update])

  const pause = useCallback(() => {
    if (latest.current) update({ ...latest.current, playing: false })
  }, [update])

  return { replay, open, exit, pause }
}
