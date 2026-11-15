import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { InferenceResult } from '../shared/api/types'
import { inference } from '../test/fixtures'
import { useProbes } from './useProbes'

vi.mock('../shared/api/client', () => ({ api: { infer: vi.fn() } }))
const infer = vi.mocked(api.infer)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const abortError = () => new DOMException('aborted', 'AbortError')

beforeEach(() => {
  infer.mockReset()
  infer.mockImplementation(async (_session, episode, frame) => ({
    ...inference,
    episode,
    start_frame: frame,
  }))
})

describe('useProbes', () => {
  it('keeps probes, leaves selection to the caller, and replaces a probe at the same frame', async () => {
    const { result } = renderHook(() => useProbes('session'))
    let created: Awaited<ReturnType<typeof result.current.probe>> = null
    await act(async () => {
      created = await result.current.probe(0, 4)
    })
    expect(infer).toHaveBeenCalledWith('session', 0, 4, expect.any(AbortSignal))
    expect(result.current.probes).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()
    expect(result.current.probing).toBe(false)
    expect(created).toMatchObject({ episode: 0, startFrame: 4 })

    await act(async () => {
      await result.current.probe(0, 4)
      await result.current.probe(1, 4)
    })
    expect(result.current.probes.map((probe) => [probe.episode, probe.startFrame])).toEqual([
      [0, 4],
      [1, 4],
    ])

    act(() => result.current.select(result.current.probes[1].id))
    act(() => result.current.removeProbe(result.current.selectedId!))
    expect(result.current.probes).toHaveLength(1)
    expect(result.current.selectedId).toBeNull()

    act(() => result.current.select(result.current.probes[0].id))
    act(() => result.current.removeProbe('missing'))
    expect(result.current.selectedId).toBe(result.current.probes[0].id)

    // The probe left is episode 0's; clearing another episode keeps it.
    act(() => result.current.clearEpisode(1))
    expect(result.current.probes).toHaveLength(1)
    act(() => result.current.clearEpisode(0))
    expect(result.current.probes).toHaveLength(0)
  })

  it('reports inference failures and lets them be dismissed', async () => {
    infer.mockRejectedValueOnce(new Error('No policy was loaded'))
    const { result } = renderHook(() => useProbes('session'))
    await act(async () => {
      expect(await result.current.probe(0, 0)).toBeNull()
    })
    expect(result.current.error).toBe('No policy was loaded')

    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    infer.mockRejectedValueOnce('boom')
    await act(async () => {
      await result.current.probe(0, 0)
    })
    expect(result.current.error).toBe('Inference failed')
  })

  it('drops a superseded probe request', async () => {
    const first = deferred<InferenceResult>()
    infer.mockImplementationOnce(async (_session, _episode, _frame, signal) => {
      signal?.addEventListener('abort', () => first.reject(abortError()))
      return first.promise
    })
    const { result } = renderHook(() => useProbes('session'))
    let stale: Promise<unknown> = Promise.resolve()
    act(() => {
      stale = result.current.probe(0, 1)
    })
    expect(result.current.probing).toBe(true)
    await act(async () => {
      await result.current.probe(0, 2)
      expect(await stale).toBeNull()
    })
    expect(result.current.probes.map((probe) => probe.startFrame)).toEqual([2])
    expect(result.current.error).toBeNull()
  })

  it('scans frames in order with progress and can be stopped', async () => {
    const { result } = renderHook(() => useProbes('session'))
    await act(async () => {
      await result.current.startScan(2, [0, 5, 10])
    })
    expect(result.current.probes.map((probe) => probe.startFrame)).toEqual([0, 5, 10])
    expect(result.current.probes.every((probe) => probe.source === 'scan')).toBe(true)
    expect(result.current.scan).toBeNull()

    const gate = deferred<InferenceResult>()
    infer.mockImplementation(async (_session, _episode, _frame, signal) => {
      signal?.addEventListener('abort', () => gate.reject(abortError()))
      return gate.promise
    })
    let scanning: Promise<void> = Promise.resolve()
    act(() => {
      scanning = result.current.startScan(3, [0, 5])
    })
    await waitFor(() => expect(result.current.scan).toEqual({ episode: 3, completed: 0, total: 2 }))
    act(() => result.current.cancelScan())
    await act(async () => {
      await scanning
    })
    expect(result.current.scan).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('reports scan failures', async () => {
    infer.mockRejectedValueOnce(new Error('CUDA out of memory'))
    const { result } = renderHook(() => useProbes('session'))
    await act(async () => {
      await result.current.startScan(0, [0, 5])
    })
    expect(result.current.error).toBe('CUDA out of memory')
    infer.mockRejectedValueOnce(42)
    await act(async () => {
      await result.current.startScan(0, [0])
    })
    expect(result.current.error).toBe('Scan failed')
  })
})
