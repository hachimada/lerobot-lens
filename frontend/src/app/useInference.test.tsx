import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { InferenceResult } from '../shared/api/types'
import { inference } from '../test/fixtures'
import { useInference } from './useInference'

vi.mock('../shared/api/client', () => ({
  api: {
    infer: vi.fn(),
  },
}))

const mockedApi = vi.mocked(api)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function renderInferenceHook() {
  const callbacks = {
    onStart: vi.fn(),
    onResult: vi.fn(),
    onClear: vi.fn(),
  }
  const hook = renderHook(() => useInference(callbacks))
  return { ...hook, callbacks }
}

beforeEach(() => {
  mockedApi.infer.mockReset()
  mockedApi.infer.mockResolvedValue(inference)
})

describe('useInference', () => {
  it('aborts and ignores an older inference when a newer request wins', async () => {
    const older = deferred<InferenceResult>()
    const newer = deferred<InferenceResult>()
    mockedApi.infer.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const newerResult = { ...inference, start_frame: 8 }
    const { result, callbacks } = renderInferenceHook()

    act(() => void result.current.run('session', 0, 1))
    await waitFor(() => expect(mockedApi.infer).toHaveBeenCalledTimes(1))
    const olderSignal = mockedApi.infer.mock.calls[0]?.[3]
    if (!olderSignal) throw new Error('Expected an abort signal')

    act(() => void result.current.run('session', 0, 8))
    await waitFor(() => expect(mockedApi.infer).toHaveBeenCalledTimes(2))
    expect(olderSignal.aborted).toBe(true)

    await act(async () => {
      newer.resolve(newerResult)
      await newer.promise
    })
    expect(result.current.inference).toEqual(newerResult)
    expect(callbacks.onResult).toHaveBeenCalledTimes(1)
    expect(callbacks.onResult).toHaveBeenCalledWith(newerResult)

    await act(async () => {
      older.resolve(inference)
      await older.promise
    })
    expect(result.current.inference).toEqual(newerResult)
    expect(callbacks.onResult).toHaveBeenCalledTimes(1)
  })

  it('exposes inference failures and finishes the request', async () => {
    mockedApi.infer.mockRejectedValue(new Error('infer failed'))
    const { result, callbacks } = renderInferenceHook()

    await act(async () => {
      await result.current.run('session', 2, 3)
    })

    expect(mockedApi.infer).toHaveBeenCalledWith('session', 2, 3, expect.any(AbortSignal))
    expect(result.current.error).toBe('infer failed')
    expect(result.current.inferring).toBe(false)
    expect(result.current.inference).toBeNull()
    expect(callbacks.onStart).toHaveBeenCalledTimes(1)
    expect(callbacks.onResult).not.toHaveBeenCalled()
  })

  it('clears and invalidates an in-flight inference', async () => {
    const pending = deferred<InferenceResult>()
    mockedApi.infer.mockReturnValue(pending.promise)
    const { result, callbacks } = renderInferenceHook()

    act(() => void result.current.run('session', 0, 0))
    await waitFor(() => expect(result.current.inferring).toBe(true))
    const signal = mockedApi.infer.mock.calls[0]?.[3]
    if (!signal) throw new Error('Expected an abort signal')

    act(() => result.current.clear())
    expect(signal.aborted).toBe(true)
    expect(result.current.inferring).toBe(false)
    expect(result.current.inference).toBeNull()
    expect(callbacks.onClear).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve(inference)
      await pending.promise
    })
    expect(result.current.inference).toBeNull()
    expect(callbacks.onResult).not.toHaveBeenCalled()
  })

  it('resets result, error, and pending work for a workspace switch', async () => {
    const pending = deferred<InferenceResult>()
    mockedApi.infer
      .mockResolvedValueOnce(inference)
      .mockRejectedValueOnce(new Error('old failure'))
      .mockReturnValueOnce(pending.promise)
    const { result, callbacks } = renderInferenceHook()

    await act(async () => {
      await result.current.run('old-session', 0, 0)
    })
    expect(result.current.inference).toEqual(inference)

    await act(async () => {
      await result.current.run('old-session', 0, 1)
    })
    expect(result.current.error).toBe('old failure')

    act(() => void result.current.run('old-session', 0, 2))
    await waitFor(() => expect(result.current.inferring).toBe(true))
    const signal = mockedApi.infer.mock.calls[2]?.[3]
    if (!signal) throw new Error('Expected an abort signal')

    act(() => result.current.reset())
    expect(signal.aborted).toBe(true)
    expect(result.current.inference).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.inferring).toBe(false)
    expect(callbacks.onClear).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve({ ...inference, start_frame: 2 })
      await pending.promise
    })
    expect(result.current.inference).toBeNull()
    expect(callbacks.onResult).toHaveBeenCalledTimes(1)
  })
})
