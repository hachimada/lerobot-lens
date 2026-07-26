import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { SessionCreate, SessionSummary } from '../shared/api/types'
import { session } from '../test/fixtures'
import { useWorkspaceSession } from './useWorkspaceSession'

vi.mock('../shared/api/client', () => ({
  api: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    getEpisodes: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)
const payload: SessionCreate = {
  dataset: 'org/data',
  policy: 'org/policy',
  urdf: null,
  device: 'cpu',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
}
const episodes = [{ index: 0, length: 2, duration: 1 / 30, task: 'pick' }]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function setup() {
  const onWorkspaceCleared = vi.fn()
  const onWorkspaceReady = vi.fn()
  const hook = renderHook(() =>
    useWorkspaceSession({
      onWorkspaceCleared,
      onWorkspaceReady,
    }),
  )
  return { ...hook, onWorkspaceCleared, onWorkspaceReady }
}

beforeEach(() => {
  mockedApi.createSession.mockReset()
  mockedApi.getSession.mockReset()
  mockedApi.getEpisodes.mockReset()
  mockedApi.createSession.mockResolvedValue(session)
  mockedApi.getSession.mockResolvedValue(session)
  mockedApi.getEpisodes.mockResolvedValue(episodes)
})

describe('useWorkspaceSession', () => {
  it('publishes only the newest request and aborts the superseded request', async () => {
    const firstSession = deferred<SessionSummary>()
    mockedApi.createSession
      .mockReturnValueOnce(firstSession.promise)
      .mockResolvedValueOnce({ ...session, id: 'new-session', dataset: 'org/new-data' })
    const { result, onWorkspaceReady } = setup()

    let firstLoad!: Promise<void>
    act(() => {
      firstLoad = result.current.loadSession(payload, false)
    })
    await waitFor(() => expect(mockedApi.createSession).toHaveBeenCalledTimes(1))
    const firstSignal = mockedApi.createSession.mock.calls[0]?.[1]
    if (!firstSignal) throw new Error('Expected the first workspace abort signal')

    await act(async () => {
      await result.current.loadSession({ ...payload, dataset: 'org/new-data' }, false)
    })

    expect(firstSignal.aborted).toBe(true)
    expect(result.current.session?.id).toBe('new-session')
    expect(onWorkspaceReady).toHaveBeenCalledTimes(1)

    firstSession.resolve({ ...session, id: 'old-session' })
    await act(async () => firstLoad)
    expect(result.current.session?.id).toBe('new-session')
    expect(onWorkspaceReady).toHaveBeenCalledTimes(1)
  })

  it('keeps the active workspace when a replacement request fails', async () => {
    const { result, onWorkspaceCleared, onWorkspaceReady } = setup()
    await act(async () => result.current.loadSession(payload, false))
    mockedApi.createSession.mockRejectedValueOnce(new Error('replacement failed'))

    await act(async () => result.current.loadSession({ ...payload, dataset: 'org/broken' }, true))

    expect(result.current.session).toEqual(session)
    expect(result.current.settingsError).toBe('replacement failed')
    expect(onWorkspaceReady).toHaveBeenCalledTimes(1)
    expect(onWorkspaceCleared).toHaveBeenCalledTimes(1)
  })

  it('aborts an in-flight replacement and invalidates it when closing the workspace', async () => {
    const replacement = deferred<SessionSummary>()
    const { result, onWorkspaceCleared, onWorkspaceReady } = setup()
    await act(async () => result.current.loadSession(payload, false))
    mockedApi.createSession.mockReturnValueOnce(replacement.promise)

    let replacementLoad!: Promise<void>
    act(() => {
      replacementLoad = result.current.loadSession({ ...payload, dataset: 'org/new' }, true)
    })
    await waitFor(() => expect(mockedApi.createSession).toHaveBeenCalledTimes(2))
    const replacementSignal = mockedApi.createSession.mock.calls[1]?.[1]
    if (!replacementSignal) throw new Error('Expected the replacement workspace abort signal')

    act(() => result.current.closeWorkspace())
    expect(replacementSignal.aborted).toBe(true)
    expect(result.current.session).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.configuration.dataset).toBe('')

    replacement.resolve({ ...session, id: 'new-session' })
    await act(async () => replacementLoad)
    expect(result.current.session).toBeNull()
    expect(onWorkspaceReady).toHaveBeenCalledTimes(1)
    expect(onWorkspaceCleared).toHaveBeenCalledTimes(2)
  })
})
