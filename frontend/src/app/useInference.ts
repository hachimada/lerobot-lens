import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../shared/api/client'
import type { InferenceResult } from '../shared/api/types'

interface Options {
  onStart: () => void
  onResult: (result: InferenceResult) => void
  onClear: () => void
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

export function useInference({ onStart, onResult, onClear }: Options) {
  const [inference, setInference] = useState<InferenceResult | null>(null)
  const [inferring, setInferring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const requestController = useRef<AbortController | null>(null)

  const invalidateRequest = useCallback(() => {
    requestGeneration.current += 1
    requestController.current?.abort()
    requestController.current = null
  }, [])

  useEffect(() => invalidateRequest, [invalidateRequest])

  const clear = useCallback(() => {
    invalidateRequest()
    setInference(null)
    setInferring(false)
    onClear()
  }, [invalidateRequest, onClear])

  const reset = useCallback(() => {
    invalidateRequest()
    setInference(null)
    setInferring(false)
    setError(null)
    onClear()
  }, [invalidateRequest, onClear])

  const run = useCallback(
    async (sessionId: string, episode: number, frame: number) => {
      invalidateRequest()
      const requestId = requestGeneration.current
      const controller = new AbortController()
      requestController.current = controller
      setInferring(true)
      setError(null)
      onStart()

      try {
        const result = await api.infer(sessionId, episode, frame, controller.signal)
        if (controller.signal.aborted || requestId !== requestGeneration.current) return
        setInference(result)
        onResult(result)
      } catch (cause) {
        if (
          controller.signal.aborted ||
          requestId !== requestGeneration.current ||
          isAbortError(cause)
        ) {
          return
        }
        setError(cause instanceof Error ? cause.message : 'Inference failed')
      } finally {
        if (requestId === requestGeneration.current) {
          requestController.current = null
          setInferring(false)
        }
      }
    },
    [invalidateRequest, onResult, onStart],
  )

  return {
    inference,
    inferring,
    error,
    run,
    clear,
    reset,
  }
}
