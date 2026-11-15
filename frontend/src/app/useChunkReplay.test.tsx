import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChunkReplay } from './useChunkReplay'
import { chunkOnStage, nextFrame, useChunkReplay } from './useChunkReplay'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function advance(ms: number, slice = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += slice) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(slice, ms - elapsed))
    })
  }
}

// Chunk a covers frames 0–4, b frames 3–7, and c frames 12–13 after a gap.
const a = { id: 'a', startFrame: 0, endFrame: 5 }
const b = { id: 'b', startFrame: 3, endFrame: 8 }
const c = { id: 'c', startFrame: 12, endFrame: 14 }
const chunks = [a, b, c]

function at(frame: number, pinned: string | null = null): ChunkReplay {
  return { frame, playing: true, pinned }
}

describe('chunkOnStage and nextFrame', () => {
  it('plays one chunk to its last step', () => {
    expect(chunkOnStage(at(4, 'a'), chunks)).toEqual({ chunk: a, step: 4 })
    expect(nextFrame(at(3, 'a'), chunks)).toBe(4)
    expect(nextFrame(at(4, 'a'), chunks)).toBeNull()
    expect(chunkOnStage(at(6, 'a'), chunks)).toBeNull()
    expect(nextFrame(at(0, 'missing'), chunks)).toBeNull()
    expect(chunkOnStage(null, chunks)).toBeNull()
  })

  it('plays through the episode from the latest observation, skipping gaps', () => {
    expect(chunkOnStage(at(2), chunks)).toEqual({ chunk: a, step: 2 })
    // Chunk b, inferred at frame 3, takes over from a there.
    expect(chunkOnStage(at(3), chunks)).toEqual({ chunk: b, step: 0 })
    expect(nextFrame(at(7), chunks)).toBe(12)
    expect(nextFrame(at(13), chunks)).toBeNull()
    expect(chunkOnStage(at(9), chunks)).toBeNull()
  })
})

describe('useChunkReplay', () => {
  it('plays a pinned chunk to its last step and stops there', async () => {
    const { result } = renderHook(() => useChunkReplay(10, chunks))
    act(() => result.current.open('a', 2, true))
    expect(result.current.replay).toEqual({ frame: 2, playing: true, pinned: 'a' })
    await advance(100)
    expect(result.current.replay?.frame).toBe(3)
    await advance(500)
    expect(result.current.replay).toEqual({ frame: 4, playing: false, pinned: 'a' })
  })

  it('plays through the chunks, jumping the gap, and can be paused and left', async () => {
    const { result } = renderHook(() => useChunkReplay(10, chunks))
    act(() => result.current.open(null, 6, true))
    await advance(200)
    expect(result.current.replay?.frame).toBe(12)
    await advance(500)
    expect(result.current.replay).toEqual({ frame: 13, playing: false, pinned: null })

    act(() => result.current.open(null, 0, true))
    act(() => result.current.pause())
    await advance(300)
    expect(result.current.replay).toEqual({ frame: 0, playing: false, pinned: null })
    act(() => result.current.exit())
    expect(result.current.replay).toBeNull()
    act(() => result.current.pause())
    expect(result.current.replay).toBeNull()
  })

  it('ignores a frame timer that fires after playback changed, before it re-rendered', () => {
    const { result } = renderHook(() => useChunkReplay(10, chunks))
    act(() => result.current.open('a', 0, true))
    // Leaving and pausing are not undone by a frame already scheduled for the old state.
    act(() => {
      result.current.exit()
      vi.advanceTimersByTime(150)
    })
    expect(result.current.replay).toBeNull()
    act(() => result.current.open('a', 0, true))
    act(() => {
      result.current.pause()
      vi.advanceTimersByTime(150)
    })
    expect(result.current.replay).toEqual({ frame: 0, playing: false, pinned: 'a' })
  })
})
