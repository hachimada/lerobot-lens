import { useCallback, useEffect, useRef, useState } from 'react'

/** A chunk to play and the step to play it from. */
export interface ChunkStart {
  probeId: string
  step: number
  steps: number
}

export interface ChunkReplay extends ChunkStart {
  playing: boolean
  /** Whether playback goes on through the episode's chunks, as the sequence decides. */
  through: boolean
}

export interface ChunkSequence {
  /**
   * The chunk and step to show after this step of a chunk: the same chunk's
   * next step, another chunk, or null at the end of the episode.
   */
  next: (probeId: string, step: number) => ChunkStart | null
  /** Called when playback moves on to another chunk. */
  onChange: (probeId: string) => void
}

interface StartOptions {
  play?: boolean
  step?: number
  through?: boolean
}

function clampStep(step: number, steps: number): number {
  return Math.min(Math.max(Math.round(step), 0), steps - 1)
}

/**
 * Steps through predicted action chunks: one chunk to its end, or the chunks
 * through the episode, moving between them as the sequence decides.
 *
 * The camera stays on the probe's input frame while this runs: a chunk holds
 * commands, which the recorded video does not show at the same moments, so the
 * meaningful comparison is predicted against recorded actions, step by step.
 */
export function useChunkReplay(stepsPerSecond: number, sequence: ChunkSequence) {
  const [replay, setReplay] = useState<ChunkReplay | null>(null)
  // The latest replay requested, ahead of React's render: a step timer that
  // fires after a newer change (leaving, pausing, seeking) must not undo it.
  const latest = useRef<ChunkReplay | null>(null)
  const update = useCallback((next: ChunkReplay | null) => {
    latest.current = next
    setReplay(next)
  }, [])
  const sequenceRef = useRef(sequence)
  useEffect(() => {
    sequenceRef.current = sequence
  })

  useEffect(() => {
    if (!replay?.playing) return
    const atEnd = replay.step >= replay.steps - 1
    if (atEnd && !replay.through) {
      update({ ...replay, playing: false })
      return
    }
    const timer = window.setTimeout(
      () => {
        if (latest.current !== replay) return
        if (!replay.through) {
          update({ ...replay, step: replay.step + 1 })
          return
        }
        // Through the episode, every step may hand over to another chunk.
        const next = sequenceRef.current.next(replay.probeId, replay.step)
        if (!next) {
          update({ ...replay, playing: false })
          return
        }
        if (next.probeId !== replay.probeId) sequenceRef.current.onChange(next.probeId)
        update({ ...next, playing: true, through: true })
      },
      1000 / Math.max(1, stepsPerSecond),
    )
    return () => window.clearTimeout(timer)
  }, [replay, stepsPerSecond, update])

  const start = useCallback(
    (
      probeId: string,
      steps: number,
      { play = true, step = 0, through = false }: StartOptions = {},
    ) => {
      const total = Math.max(1, steps)
      update({ probeId, step: clampStep(step, total), steps: total, playing: play, through })
    },
    [update],
  )

  const exit = useCallback(() => update(null), [update])

  /** Play this chunk alone, or on through the episode. */
  const play = useCallback(
    (through: boolean) => {
      const current = latest.current
      if (!current) return
      update({
        ...current,
        // Playing one chunk again from its last step starts it over.
        step: !through && current.step >= current.steps - 1 ? 0 : current.step,
        playing: true,
        through,
      })
    },
    [update],
  )

  const pause = useCallback(() => {
    if (latest.current) update({ ...latest.current, playing: false })
  }, [update])

  const seekStep = useCallback(
    (step: number) => {
      const current = latest.current
      if (current) update({ ...current, playing: false, step: clampStep(step, current.steps) })
    },
    [update],
  )

  return { replay, start, exit, play, pause, seekStep }
}
