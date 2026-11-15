import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import { frame } from '../test/fixtures'
import { EMPTY_FRAME, useEpisodeData } from './useEpisodeData'

vi.mock('../shared/api/client', () => ({
  api: { getFrame: vi.fn(), getEpisodeActions: vi.fn() },
}))
const mocked = vi.mocked(api)

const actions = { episode: 0, fps: 30, action_names: ['a'], actions: [[1], [2], [3]] }

beforeEach(() => {
  mocked.getFrame.mockResolvedValue(frame)
  mocked.getEpisodeActions.mockResolvedValue(actions)
})

describe('useEpisodeData', () => {
  it('loads the frame and recorded actions of an episode', async () => {
    mocked.getFrame.mockResolvedValue({ ...frame, episode: 4, frame: 1 })
    const { result, rerender } = renderHook((props) => useEpisodeData(props), {
      initialProps: { sessionId: 's', episodeIndex: 4, frameIndex: 1 },
    })
    expect(result.current.frameData).toEqual(EMPTY_FRAME)
    expect(result.current.frameLoading).toBe(true)
    await waitFor(() => expect(result.current.frameLoading).toBe(false))
    expect(result.current.episodeActions).toEqual(actions)
    expect(mocked.getFrame).toHaveBeenCalledWith('s', 4, 1, expect.any(AbortSignal))

    // Loading lasts until the requested frame is the one on screen.
    rerender({ sessionId: 's', episodeIndex: 4, frameIndex: 2 })
    expect(result.current.frameLoading).toBe(true)
    rerender({ sessionId: 's', episodeIndex: 0, frameIndex: 0 })
    await waitFor(() =>
      expect(mocked.getEpisodeActions).toHaveBeenLastCalledWith('s', 0, expect.any(AbortSignal)),
    )
  })

  it('reports decode and action failures', async () => {
    mocked.getFrame.mockRejectedValueOnce(new Error('decode failed'))
    const { result } = renderHook(() =>
      useEpisodeData({ sessionId: 's', episodeIndex: 0, frameIndex: 0 }),
    )
    await waitFor(() => expect(result.current.error).toBe('decode failed'))
    act(() => result.current.clearError())

    mocked.getFrame.mockRejectedValueOnce('nope')
    mocked.getEpisodeActions.mockRejectedValueOnce('nope')
    const second = renderHook(() =>
      useEpisodeData({ sessionId: 's', episodeIndex: 4, frameIndex: 0 }),
    )
    await waitFor(() =>
      expect(['Failed to decode frame', 'Failed to load episode actions']).toContain(
        second.result.current.error,
      ),
    )

    mocked.getEpisodeActions.mockRejectedValueOnce(new Error('actions failed'))
    const third = renderHook(() =>
      useEpisodeData({ sessionId: 's', episodeIndex: 0, frameIndex: 0 }),
    )
    await waitFor(() => expect(third.result.current.error).toBe('actions failed'))
  })

  it('ignores aborted requests', async () => {
    mocked.getFrame.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    mocked.getEpisodeActions.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    const { result, unmount } = renderHook(() =>
      useEpisodeData({ sessionId: 's', episodeIndex: 0, frameIndex: 0 }),
    )
    await act(async () => {})
    expect(result.current.error).toBeNull()
    unmount()
  })
})
