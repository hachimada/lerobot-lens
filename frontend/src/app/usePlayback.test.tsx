import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePlayback } from './usePlayback'

function usePlayer(frameCount = 10, initial = 0, ready = true) {
  const [frame, setFrame] = useState(initial)
  const [speed, setSpeed] = useState(1)
  const playback = usePlayback({ frame, frameCount, fps: 10, speed, onFrame: setFrame, ready })
  return { frame, setSpeed, ...playback }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Advance in frame-sized slices: each slice lets React commit and schedule the next frame. */
async function advance(ms: number, slice = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += slice) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(slice, ms - elapsed))
    })
  }
}

describe('usePlayback', () => {
  it('plays to the last frame at the selected speed and then stops', async () => {
    const { result } = renderHook(() => usePlayer(4))
    act(() => result.current.play())
    await advance(100)
    expect(result.current.frame).toBe(1)

    act(() => result.current.setSpeed(2))
    await advance(50)
    expect(result.current.frame).toBe(2)
    await advance(500)
    expect(result.current.frame).toBe(3)
    expect(result.current.playing).toBe(false)
  })

  it('restarts from the beginning when played at the end and toggles pause', async () => {
    const { result } = renderHook(() => usePlayer(3, 2))
    act(() => result.current.toggle())
    expect(result.current.frame).toBe(0)
    expect(result.current.playing).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.playing).toBe(false)
    await advance(500)
    expect(result.current.frame).toBe(0)
  })

  it('clamps seeks and steps, and stepping pauses playback', () => {
    const { result } = renderHook(() => usePlayer(5, 2))
    act(() => result.current.seek(99))
    expect(result.current.frame).toBe(4)
    act(() => result.current.seek(-3))
    expect(result.current.frame).toBe(0)
    act(() => result.current.play())
    act(() => result.current.step(2))
    expect(result.current.frame).toBe(2)
    expect(result.current.playing).toBe(false)
  })

  it('waits until the current frame is on screen before advancing', async () => {
    const { result, rerender } = renderHook(({ ready }) => usePlayer(10, 0, ready), {
      initialProps: { ready: false },
    })
    act(() => result.current.play())
    await advance(500)
    expect(result.current.frame).toBe(0)
    expect(result.current.playing).toBe(true)

    // Decoding took longer than a frame interval, so the next frame follows immediately.
    rerender({ ready: true })
    await advance(10)
    expect(result.current.frame).toBe(1)
  })
})
