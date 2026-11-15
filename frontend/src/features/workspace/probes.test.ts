import { describe, expect, it } from 'vitest'

import type { InferenceResult } from '../../shared/api/types'
import type { Probe } from './probes'
import {
  chunkAt,
  errorLevel,
  jointRanges,
  packLanes,
  probeMetrics,
  scanFrames,
  scanStride,
  toChunk,
  toProbeView,
} from './probes'

function result(predicted: number[][], truth: number[][], start = 0): InferenceResult {
  return {
    episode: 0,
    start_frame: start,
    fps: 30,
    predicted_actions: predicted,
    ground_truth_actions: truth,
    chunk_size: predicted.length,
  }
}

function probe(id: string, startFrame: number, steps: number): Probe {
  const rows = Array.from({ length: steps }, () => [0, 0])
  return { id, episode: 0, startFrame, result: result(rows, rows, startFrame), source: 'manual' }
}

describe('probe metrics', () => {
  it('classifies normalized errors into levels', () => {
    expect(errorLevel(0.01)).toBe('good')
    expect(errorLevel(0.1)).toBe('fair')
    expect(errorLevel(0.5)).toBe('poor')
  })

  it('floors the range of joints that barely move', () => {
    const ranges = jointRanges(
      [
        [0, 5, Number.NaN],
        [100, 5, Number.NaN],
      ],
      3,
    )
    expect(ranges).toEqual([100, 5, 5])
    expect(jointRanges([], 2)).toEqual([1e-6, 1e-6])
  })

  it('computes per-joint and normalized mean absolute errors', () => {
    const metrics = probeMetrics(
      result(
        [
          [1, 10],
          [3, 10],
        ],
        [
          [0, 10],
          [0, 14],
        ],
      ),
      [20, 40],
    )
    expect(metrics.jointErrors).toEqual([2, 2])
    expect(metrics.meanAbsoluteError).toBe(2)
    expect(metrics.normalizedError).toBeCloseTo((2 / 20 + 2 / 40) / 2)
    expect(metrics.level).toBe('fair')

    const empty = probeMetrics(result([], []), [])
    expect(empty).toEqual({
      meanAbsoluteError: 0,
      jointErrors: [],
      normalizedError: 0,
      level: 'good',
    })
  })

  it('builds views with the chunk end', () => {
    const view = toProbeView(toChunk(probe('a', 4, 10)), [1, 1])
    expect(view).toMatchObject({ steps: 10, endFrame: 14 })
  })

  it('stacks overlapping chunks into rows and keeps back-to-back chunks on one row', () => {
    const chunk = (startFrame: number, endFrame: number) => ({ startFrame, endFrame })
    const lanes = packLanes([chunk(40, 90), chunk(0, 50), chunk(50, 100), chunk(80, 130)])
    expect(lanes).toEqual([[chunk(0, 50), chunk(50, 100)], [chunk(40, 90)], [chunk(80, 130)]])
    expect(packLanes([])).toEqual([])
  })

  it('lists scan frames at a stride derived from the chunk length and overlap', () => {
    expect(scanStride(50, 0)).toBe(50)
    expect(scanStride(50, 10)).toBe(40)
    expect(scanStride(5, 9)).toBe(1)
    expect(scanFrames(10, 4)).toEqual([0, 4, 8])
    expect(scanFrames(3, 0)).toEqual([0, 1, 2])
  })

  it('shows at each frame the chunk inferred from the latest observation, or jumps a gap', () => {
    const chunk = (startFrame: number, endFrame: number) => ({ startFrame, endFrame })
    // Chunks 120–169 and 160–209: the first plays until the newer one starts at 160.
    const pair = [chunk(120, 170), chunk(160, 210)]
    expect(chunkAt(pair, 159)).toEqual({ chunk: pair[0], step: 39 })
    expect(chunkAt(pair, 160)).toEqual({ chunk: pair[1], step: 0 })
    expect(chunkAt(pair, 209)).toEqual({ chunk: pair[1], step: 49 })
    expect(chunkAt(pair, 210)).toBeNull()

    // Order does not matter, and a chunk with nothing newer plays to its end.
    const reversed = [chunk(160, 210), chunk(120, 170)]
    expect(chunkAt(reversed, 165)).toEqual({ chunk: reversed[0], step: 5 })
    expect(chunkAt([chunk(0, 50)], 49)).toEqual({ chunk: chunk(0, 50), step: 49 })

    // A gap jumps to the next chunk's first step; of two chunks from one observation, the later
    // inference wins.
    const gaps = [chunk(0, 5), chunk(20, 25), chunk(12, 17), chunk(20, 22)]
    expect(chunkAt(gaps, 5)).toEqual({ chunk: gaps[2], step: 0 })
    expect(chunkAt(gaps, 21)).toEqual({ chunk: gaps[3], step: 1 })
    expect(chunkAt([], 0)).toBeNull()
  })
})
