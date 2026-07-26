import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { inference } from '../test/fixtures'
import { usePlayback } from './usePlayback'

function usePlaybackHarness(frameCount = 3, episodeFps = 10) {
  const [frame, setFrame] = useState(0)
  const playback = usePlayback({
    frame,
    frameCount,
    episodeFps,
    onFrame: setFrame,
  })
  return { frame, setFrame, ...playback }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('usePlayback', () => {
  it('plays at the selected speed and stops at the episode boundary', async () => {
    const { result } = renderHook(() => usePlaybackHarness())

    act(() => {
      result.current.setSpeed(2)
      result.current.setPlaying(true)
    })
    expect(result.current.speed).toBe(2)

    await act(async () => vi.advanceTimersByTimeAsync(50))
    expect(result.current.frame).toBe(1)
    await act(async () => vi.advanceTimersByTimeAsync(50))
    expect(result.current.frame).toBe(2)
    await act(async () => vi.advanceTimersByTimeAsync(50))
    expect(result.current.frame).toBe(2)
    expect(result.current.playing).toBe(false)
  })

  it('clamps restart, previous, next, and seek operations to frame boundaries', () => {
    const { result } = renderHook(() => usePlaybackHarness())

    act(() => result.current.previous())
    expect(result.current.frame).toBe(0)
    act(() => result.current.next())
    expect(result.current.frame).toBe(1)
    act(() => result.current.seek(99))
    expect(result.current.frame).toBe(2)
    act(() => result.current.next())
    expect(result.current.frame).toBe(2)
    act(() => result.current.restart())
    expect(result.current.frame).toBe(0)
    act(() => result.current.seek(-4))
    expect(result.current.frame).toBe(0)
  })

  it('plays and bounds an action chunk replay', async () => {
    const { result } = renderHook(() => usePlaybackHarness())

    act(() => result.current.startChunk({ ...inference, start_frame: 4, fps: 10 }))
    expect(result.current.inferenceRange).toEqual([4, 6])
    expect(result.current.inferenceStep).toBe(0)
    expect(result.current.inferencePlaying).toBe(true)

    await act(async () => vi.advanceTimersByTimeAsync(100))
    expect(result.current.inferenceStep).toBe(1)
    await act(async () => vi.advanceTimersByTimeAsync(100))
    expect(result.current.inferenceStep).toBe(1)
    expect(result.current.inferencePlaying).toBe(false)

    act(() => result.current.setChunkStep(99))
    expect(result.current.inferenceStep).toBe(1)
    act(() => result.current.setChunkStep(-1))
    expect(result.current.inferenceStep).toBe(0)
  })

  it('stops and resets episode and chunk playback for scope changes', () => {
    const { result, unmount } = renderHook(() => usePlaybackHarness())
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')

    act(() => {
      result.current.setSpeed(2)
      result.current.setPlaying(true)
      result.current.startChunk(inference)
    })
    act(() => result.current.reset())
    expect(result.current.playing).toBe(false)
    expect(result.current.inferencePlaying).toBe(false)
    expect(result.current.inferenceStep).toBe(0)
    expect(result.current.inferenceRange).toBeUndefined()
    expect(result.current.speed).toBe(2)

    act(() => result.current.reset(true))
    expect(result.current.speed).toBe(1)

    act(() => {
      result.current.setPlaying(true)
      result.current.startChunk(inference)
    })
    unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
