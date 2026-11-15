import type { InferenceResult } from '../../shared/api/types'

export type ErrorLevel = 'good' | 'fair' | 'poor'

/** One policy inference anchored at a dataset frame. */
export interface Probe {
  id: string
  episode: number
  startFrame: number
  result: InferenceResult
  source: 'manual' | 'scan'
}

export interface ProbeMetrics {
  /** Mean absolute error over every step and joint, in dataset units. */
  meanAbsoluteError: number
  /** Mean absolute error per joint, in dataset units. */
  jointErrors: number[]
  /** Mean of per-joint errors divided by each joint's range in the episode. */
  normalizedError: number
  level: ErrorLevel
}

/** A probe placed on the episode's time axis. */
export interface ProbeChunk extends Probe {
  /** Predicted steps, one per frame from `startFrame`. */
  steps: number
  /** The frame after the last predicted step. */
  endFrame: number
}

export interface ProbeView extends ProbeChunk {
  metrics: ProbeMetrics
}

const GOOD_THRESHOLD = 0.05
const FAIR_THRESHOLD = 0.15

export function errorLevel(normalizedError: number): ErrorLevel {
  if (normalizedError < GOOD_THRESHOLD) return 'good'
  if (normalizedError < FAIR_THRESHOLD) return 'fair'
  return 'poor'
}

export const ERROR_LEVEL_LABEL: Record<ErrorLevel, string> = {
  good: 'On track',
  fair: 'Drifting',
  poor: 'Diverging',
}

/**
 * Range of each joint over the recorded episode, floored so a joint that
 * barely moves (a static gripper, for example) does not inflate normalized errors.
 */
export function jointRanges(actions: number[][], dimensions: number): number[] {
  const ranges = Array.from({ length: dimensions }, (_, joint) => {
    let min = Infinity
    let max = -Infinity
    for (const action of actions) {
      const value = action[joint]
      if (!Number.isFinite(value)) continue
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    return max >= min ? max - min : 0
  })
  const widest = Math.max(0, ...ranges)
  const floor = Math.max(widest * 0.05, 1e-6)
  return ranges.map((range) => Math.max(range, floor))
}

export function probeMetrics(result: InferenceResult, ranges: number[]): ProbeMetrics {
  const steps = Math.min(result.predicted_actions.length, result.ground_truth_actions.length)
  const dimensions = Math.min(
    result.predicted_actions[0]?.length ?? 0,
    result.ground_truth_actions[0]?.length ?? 0,
  )
  const jointErrors = Array.from({ length: dimensions }, (_, joint) => {
    if (steps === 0) return 0
    let total = 0
    for (let step = 0; step < steps; step += 1) {
      total += Math.abs(
        result.predicted_actions[step][joint] - result.ground_truth_actions[step][joint],
      )
    }
    return total / steps
  })
  const meanAbsoluteError =
    dimensions > 0 ? jointErrors.reduce((sum, error) => sum + error, 0) / dimensions : 0
  const normalizedError =
    dimensions > 0
      ? jointErrors.reduce((sum, error, joint) => sum + error / (ranges[joint] ?? 1), 0) /
        dimensions
      : 0
  return { meanAbsoluteError, jointErrors, normalizedError, level: errorLevel(normalizedError) }
}

export function toChunk(probe: Probe): ProbeChunk {
  const steps = probe.result.predicted_actions.length
  return { ...probe, steps, endFrame: probe.startFrame + steps }
}

export function toProbeView(chunk: ProbeChunk, ranges: number[]): ProbeView {
  return { ...chunk, metrics: probeMetrics(chunk.result, ranges) }
}

/**
 * Joint ranges that normalize an episode's probe errors: from the recorded
 * actions once loaded, otherwise from the probes' own recorded counterparts.
 */
export function episodeRanges(
  probes: Probe[],
  recorded: number[][] | null,
  dimensions: number,
): number[] {
  return jointRanges(
    recorded ?? probes.flatMap((probe) => probe.result.ground_truth_actions),
    dimensions,
  )
}

/** The step of a chunk at a frame, or null when the chunk does not cover it. */
export function stepAt(
  chunk: { startFrame: number; endFrame: number },
  frame: number,
): number | null {
  return frame >= chunk.startFrame && frame < chunk.endFrame ? frame - chunk.startFrame : null
}

/**
 * The chunk to show at a frame when playing the chunks through the episode.
 * Among the chunks covering the frame, the one inferred from the latest
 * observation wins, from its step at that frame; of chunks inferred from the
 * same observation, the later inference. So a chunk plays until a newer one
 * starts, or to its end if none does. In a gap, playback jumps to the next
 * chunk's first step; past the last chunk it ends.
 */
export function chunkAt<T extends { startFrame: number; endFrame: number }>(
  chunks: T[],
  frame: number,
): { chunk: T; step: number } | null {
  let covering: T | null = null
  let next: T | null = null
  for (const chunk of chunks) {
    if (stepAt(chunk, frame) !== null) {
      // A chunk starts at the frame the policy observed, so a later start is a newer observation.
      if (!covering || chunk.startFrame >= covering.startFrame) covering = chunk
    } else if (chunk.startFrame > frame && (!next || chunk.startFrame < next.startFrame)) {
      next = chunk
    }
  }
  if (covering) return { chunk: covering, step: frame - covering.startFrame }
  return next && { chunk: next, step: 0 }
}

/**
 * Rows for drawing chunks so none overlap, keeping every chunk clickable:
 * each probe goes to the first row whose last chunk ends before it starts.
 */
export function packLanes<T extends { startFrame: number; endFrame: number }>(probes: T[]): T[][] {
  const lanes: T[][] = []
  const ends: number[] = []
  for (const probe of [...probes].sort((left, right) => left.startFrame - right.startFrame)) {
    const lane = ends.findIndex((end) => end <= probe.startFrame)
    if (lane === -1) {
      lanes.push([probe])
      ends.push(probe.endFrame)
    } else {
      lanes[lane].push(probe)
      ends[lane] = probe.endFrame
    }
  }
  return lanes
}

/** Scan stride for a chunk length and overlap: one chunk length, less the steps chunks share. */
export function scanStride(chunkSize: number, overlap: number): number {
  return Math.max(1, chunkSize - overlap)
}

/** Frames to probe when scanning an episode at a fixed stride. */
export function scanFrames(frameCount: number, stride: number): number[] {
  const step = Math.max(1, Math.round(stride))
  const frames: number[] = []
  for (let frame = 0; frame < frameCount; frame += step) frames.push(frame)
  return frames
}
