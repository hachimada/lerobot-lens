import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { SessionCreate, SessionSummary } from '../shared/api/types'
import { session } from '../test/fixtures'
import { DEMO_CONFIGURATION, DEMO_POLICY, useWorkspaceSession } from './useWorkspaceSession'

vi.mock('../shared/api/client', () => ({
  api: { createSession: vi.fn(), getSession: vi.fn(), getEpisodes: vi.fn() },
}))
const mocked = vi.mocked(api)

const payload: SessionCreate = {
  dataset: 'org/data',
  policy: 'org/policy',
  urdf: null,
  device: 'auto',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
}
const episodes = [{ index: 0, length: 2, duration: 0.1, task: 'pick' }]
const loadingSession: SessionSummary = { ...session, status: 'loading', message: 'Loading policy…' }

beforeEach(() => {
  vi.useFakeTimers()
  mocked.createSession.mockResolvedValue(session)
  mocked.getSession.mockResolvedValue(session)
  mocked.getEpisodes.mockResolvedValue(episodes)
})
afterEach(() => vi.useRealTimers())

describe('useWorkspaceSession', () => {
  it('polls a loading session, exposes progress, and publishes it when ready', async () => {
    mocked.createSession.mockResolvedValue(loadingSession)
    const { result } = renderHook(() => useWorkspaceSession())
    let opened: Promise<boolean> = Promise.resolve(false)
    act(() => {
      opened = result.current.loadSession(payload)
    })
    expect(result.current.loading).toMatchObject({ hasPolicy: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.loading?.message).toBe('Loading policy…')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
      expect(await opened).toBe(true)
    })
    expect(mocked.getSession).toHaveBeenCalledWith('session', expect.any(AbortSignal))
    expect(result.current.session).toEqual(session)
    expect(result.current.episodes).toEqual(episodes)
    expect(result.current.configuration).toEqual(payload)
    expect(result.current.loading).toBeNull()

    act(() => result.current.closeSession())
    expect(result.current.session).toBeNull()
  })

  it('maps a demo session back to an editable configuration', async () => {
    mocked.createSession.mockResolvedValue({
      ...session,
      dataset: 'org/demo · Episode 0',
      has_urdf: true,
      dataset_angle_unit: 'degrees',
    })
    const { result } = renderHook(() => useWorkspaceSession())
    await act(async () => {
      await result.current.loadSession(DEMO_CONFIGURATION)
    })
    expect(result.current.configuration).toMatchObject({
      dataset: 'org/demo',
      policy: DEMO_POLICY,
      urdf: 'builtin://so101',
      dataset_angle_unit: 'degrees',
      demo: true,
    })
  })

  it('reports load errors and empty datasets but keeps the current session', async () => {
    const { result } = renderHook(() => useWorkspaceSession())
    await act(async () => {
      await result.current.loadSession(payload)
    })
    mocked.createSession.mockResolvedValueOnce({ ...session, status: 'error', message: 'boom' })
    await act(async () => {
      expect(await result.current.loadSession(payload)).toBe(false)
    })
    expect(result.current.error).toBe('boom')
    expect(result.current.session).toEqual(session)

    mocked.getEpisodes.mockResolvedValueOnce([])
    await act(async () => {
      await result.current.loadSession(payload)
    })
    expect(result.current.error).toBe('The dataset contains no episodes.')

    mocked.createSession.mockRejectedValueOnce('offline')
    await act(async () => {
      await result.current.loadSession(payload)
    })
    expect(result.current.error).toBe('Failed to load the session')
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()
  })

  it('cancels a pending load without reporting an error', async () => {
    mocked.createSession.mockResolvedValue(loadingSession)
    mocked.getSession.mockResolvedValue(loadingSession)
    const { result } = renderHook(() => useWorkspaceSession())
    let opened: Promise<boolean> = Promise.resolve(true)
    act(() => {
      opened = result.current.loadSession({ ...payload, policy: null })
    })
    expect(result.current.loading?.hasPolicy).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    act(() => result.current.cancelLoading())
    expect(result.current.loading).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      expect(await opened).toBe(false)
    })
    expect(result.current.error).toBeNull()

    mocked.createSession.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await act(async () => {
      expect(await result.current.loadSession(payload)).toBe(false)
    })
    expect(result.current.error).toBeNull()
  })
})
