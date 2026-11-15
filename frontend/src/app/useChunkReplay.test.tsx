import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useChunkReplay } from './useChunkReplay'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const noSequence = { next: () => null, onChange: () => {} }

async function advance(ms: number, slice = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += slice) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(slice, ms - elapsed))
    })
  }
}

describe('useChunkReplay', () => {
  it('plays a chunk to its last step and holds it there', async () => {
    const { result } = renderHook(() => useChunkReplay(10, noSequence))
    act(() => result.current.start('p', 3))
    expect(result.current.replay).toEqual({
      probeId: 'p',
      step: 0,
      steps: 3,
      playing: true,
      through: false,
    })
    await advance(100)
    expect(result.current.replay?.step).toBe(1)
    await advance(400)
    expect(result.current.replay).toMatchObject({ step: 2, playing: false })

    // Playing the chunk again from its end starts over.
    act(() => result.current.play(false))
    expect(result.current.replay).toMatchObject({ step: 0, playing: true })
    act(() => result.current.pause())
    expect(result.current.replay).toMatchObject({ step: 0, playing: false })
  })

  it('lets the sequence decide each step, moving between chunks', async () => {
    const onChange = vi.fn()
    // a plays steps 0–1, then b takes over at its step 1 and ends.
    const next = vi.fn((probeId: string, step: number) => {
      if (probeId === 'a' && step === 0) return { probeId: 'a', step: 1, steps: 3 }
      if (probeId === 'a') return { probeId: 'b', step: 1, steps: 3 }
      return step < 2 ? { probeId: 'b', step: step + 1, steps: 3 } : null
    })
    const { result } = renderHook(() => useChunkReplay(10, { next, onChange }))
    act(() => result.current.start('a', 3, { through: true }))
    await advance(100)
    expect(result.current.replay).toMatchObject({ probeId: 'a', step: 1, through: true })
    expect(onChange).not.toHaveBeenCalled()
    await advance(100)
    expect(next).toHaveBeenLastCalledWith('a', 1)
    expect(onChange).toHaveBeenCalledWith('b')
    expect(result.current.replay).toEqual({
      probeId: 'b',
      step: 1,
      steps: 3,
      playing: true,
      through: true,
    })
    // Nothing follows b's last step, so playback ends there.
    await advance(300)
    expect(result.current.replay).toMatchObject({ probeId: 'b', step: 2, playing: false })
    expect(onChange).toHaveBeenCalledTimes(1)

    // Pausing keeps the mode; playing one chunk leaves it.
    act(() => result.current.play(true))
    expect(result.current.replay).toMatchObject({ step: 2, playing: true, through: true })
    act(() => result.current.pause())
    act(() => result.current.play(false))
    expect(result.current.replay).toMatchObject({ step: 0, playing: true, through: false })
  })

  it('seeks within the chunk, pausing, and can be left', () => {
    const { result } = renderHook(() => useChunkReplay(10, noSequence))
    act(() => result.current.play(true))
    act(() => result.current.pause())
    act(() => result.current.seekStep(1))
    expect(result.current.replay).toBeNull()

    act(() => result.current.start('p', 5, { play: false }))
    act(() => result.current.seekStep(99))
    expect(result.current.replay).toMatchObject({ step: 4, playing: false })
    act(() => result.current.seekStep(-3))
    expect(result.current.replay?.step).toBe(0)
    act(() => result.current.exit())
    expect(result.current.replay).toBeNull()

    act(() => result.current.start('empty', 0))
    expect(result.current.replay?.steps).toBe(1)
  })
})
