import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { EpisodeActions, FrameData } from '../shared/api/types'
import { frame } from '../test/fixtures'
import { useEpisodeData } from './useEpisodeData'

vi.mock('../shared/api/client', () => ({
  api: {
    getFrame: vi.fn(),
    getEpisodeActions: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)
const episodes = [
  { index: 0, length: 2, duration: 1 / 30, task: 'pick' },
  { index: 1, length: 2, duration: 1 / 30, task: 'place' },
]
const actions: EpisodeActions = {
  episode: 0,
  fps: 30,
  action_names: ['shoulder', 'elbow'],
  actions: [
    [1, 2],
    [1.1, 2.1],
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mockedApi.getFrame.mockReset()
  mockedApi.getEpisodeActions.mockReset()
  mockedApi.getFrame.mockResolvedValue(frame)
  mockedApi.getEpisodeActions.mockResolvedValue(actions)
})

describe('useEpisodeData', () => {
  it('aborts old frame and action requests when the selected episode changes', async () => {
    const oldFrame = deferred<FrameData>()
    const oldActions = deferred<EpisodeActions>()
    mockedApi.getFrame.mockImplementation((_sessionId, episode) =>
      episode === 0 ? oldFrame.promise : Promise.resolve({ ...frame, episode: 1, timestamp: 2.5 }),
    )
    mockedApi.getEpisodeActions.mockImplementation((_sessionId, episode) =>
      episode === 0
        ? oldActions.promise
        : Promise.resolve({ ...actions, episode: 1, actions: [[9, 8]] }),
    )
    const { result, rerender } = renderHook(
      ({ episodeIndex, frameIndex }) => useEpisodeData({ episodeIndex, frameIndex }),
      { initialProps: { episodeIndex: 0, frameIndex: 0 } },
    )

    act(() => result.current.installWorkspace('old-session', episodes))
    await waitFor(() => {
      expect(mockedApi.getFrame).toHaveBeenCalledTimes(1)
      expect(mockedApi.getEpisodeActions).toHaveBeenCalledTimes(1)
    })
    const oldFrameSignal = mockedApi.getFrame.mock.calls[0]?.[3]
    const oldActionsSignal = mockedApi.getEpisodeActions.mock.calls[0]?.[2]
    if (!oldFrameSignal || !oldActionsSignal) throw new Error('Expected old request signals')

    rerender({ episodeIndex: 1, frameIndex: 0 })
    await waitFor(() => expect(result.current.frameData.timestamp).toBe(2.5))
    expect(result.current.episodeActions?.episode).toBe(1)
    expect(oldFrameSignal.aborted).toBe(true)
    expect(oldActionsSignal.aborted).toBe(true)

    oldFrame.resolve({ ...frame, timestamp: 9.9 })
    oldActions.resolve({ ...actions, actions: [[99, 99]] })
    await act(async () => {
      await Promise.all([oldFrame.promise, oldActions.promise])
    })
    expect(result.current.frameData.timestamp).toBe(2.5)
    expect(result.current.episodeActions?.actions).toEqual([[9, 8]])
  })

  it('installs a new workspace without requesting an episode retained from the old workspace', async () => {
    const oldFrame = deferred<FrameData>()
    const oldActions = deferred<EpisodeActions>()
    mockedApi.getFrame.mockImplementation((sessionId, episode) =>
      sessionId === 'old-session'
        ? oldFrame.promise
        : Promise.resolve({ ...frame, episode, timestamp: 3.5 }),
    )
    mockedApi.getEpisodeActions.mockImplementation((sessionId, episode) =>
      sessionId === 'old-session'
        ? oldActions.promise
        : Promise.resolve({ ...actions, episode, actions: [[3, 5]] }),
    )
    const { result, rerender } = renderHook(
      ({ episodeIndex, frameIndex }) => useEpisodeData({ episodeIndex, frameIndex }),
      { initialProps: { episodeIndex: 8, frameIndex: 0 } },
    )

    act(() =>
      result.current.installWorkspace('old-session', [
        { index: 8, length: 2, duration: 1 / 30, task: 'old' },
      ]),
    )
    await waitFor(() => expect(mockedApi.getFrame).toHaveBeenCalledTimes(1))
    const oldFrameSignal = mockedApi.getFrame.mock.calls[0]?.[3]
    const oldActionsSignal = mockedApi.getEpisodeActions.mock.calls[0]?.[2]

    act(() =>
      result.current.installWorkspace('new-session', [
        { index: 3, length: 2, duration: 1 / 30, task: 'new' },
      ]),
    )
    rerender({ episodeIndex: 3, frameIndex: 0 })

    await waitFor(() =>
      expect(mockedApi.getFrame).toHaveBeenCalledWith('new-session', 3, 0, expect.any(AbortSignal)),
    )
    expect(mockedApi.getFrame).not.toHaveBeenCalledWith(
      'new-session',
      8,
      expect.any(Number),
      expect.any(AbortSignal),
    )
    expect(oldFrameSignal?.aborted).toBe(true)
    expect(oldActionsSignal?.aborted).toBe(true)
    await waitFor(() => {
      expect(result.current.frameData.timestamp).toBe(3.5)
      expect(result.current.episodeActions?.episode).toBe(3)
    })
  })

  it('exposes request failures and clears them without losing the installed episode', async () => {
    mockedApi.getFrame.mockRejectedValue(new Error('frame failed'))
    const { result } = renderHook(() => useEpisodeData({ episodeIndex: 0, frameIndex: 0 }))

    act(() => result.current.installWorkspace('session', episodes))

    await waitFor(() => expect(result.current.error).toBe('frame failed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.selectedEpisode?.index).toBe(0)

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    act(() => result.current.reset())
    expect(result.current.episodes).toEqual([])
    expect(result.current.frameData.state).toEqual([])
  })
})
