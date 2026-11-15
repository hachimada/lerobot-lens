import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../shared/api/client'
import { errorMessage, isAbortError } from '../shared/lib/errors'
import type { Probe } from '../features/workspace/probes'

export interface ScanProgress {
  episode: number
  completed: number
  total: number
}

function upsert(probes: Probe[], probe: Probe): Probe[] {
  return [
    ...probes.filter(
      (existing) => existing.episode !== probe.episode || existing.startFrame !== probe.startFrame,
    ),
    probe,
  ]
}

/**
 * Policy inferences ("probes") kept for the whole session, so moving the
 * playhead or switching episodes never discards results.
 */
export function useProbes(sessionId: string) {
  const [probes, setProbes] = useState<Probe[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [probing, setProbing] = useState(false)
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const probeController = useRef<AbortController | null>(null)
  const scanController = useRef<AbortController | null>(null)
  const nextId = useRef(0)

  useEffect(
    () => () => {
      probeController.current?.abort()
      scanController.current?.abort()
    },
    [],
  )

  const createProbe = useCallback(
    async (
      episode: number,
      frame: number,
      source: Probe['source'],
      signal: AbortSignal,
    ): Promise<Probe> => {
      const result = await api.infer(sessionId, episode, frame, signal)
      nextId.current += 1
      return { id: `probe-${nextId.current}`, episode, startFrame: frame, result, source }
    },
    [sessionId],
  )

  const probe = useCallback(
    async (episode: number, frame: number): Promise<Probe | null> => {
      probeController.current?.abort()
      const controller = new AbortController()
      probeController.current = controller
      setProbing(true)
      setError(null)
      try {
        const created = await createProbe(episode, frame, 'manual', controller.signal)
        if (controller.signal.aborted) return null
        setProbes((current) => upsert(current, created))
        return created
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return null
        setError(errorMessage(cause, 'Inference failed'))
        return null
      } finally {
        if (probeController.current === controller) {
          probeController.current = null
          setProbing(false)
        }
      }
    },
    [createProbe],
  )

  const startScan = useCallback(
    async (episode: number, frames: number[]) => {
      scanController.current?.abort()
      const controller = new AbortController()
      scanController.current = controller
      setError(null)
      setScan({ episode, completed: 0, total: frames.length })
      try {
        for (const [index, frame] of frames.entries()) {
          const created = await createProbe(episode, frame, 'scan', controller.signal)
          if (controller.signal.aborted) return
          setProbes((current) => upsert(current, created))
          setScan({ episode, completed: index + 1, total: frames.length })
        }
      } catch (cause) {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          setError(errorMessage(cause, 'Scan failed'))
        }
      } finally {
        if (scanController.current === controller) {
          scanController.current = null
          setScan(null)
        }
      }
    },
    [createProbe],
  )

  const cancelScan = useCallback(() => {
    scanController.current?.abort()
    scanController.current = null
    setScan(null)
  }, [])

  const removeProbe = useCallback((id: string) => {
    setProbes((current) => current.filter((probe) => probe.id !== id))
    setSelectedId((current) => (current === id ? null : current))
  }, [])

  const clearEpisode = useCallback((episode: number) => {
    setProbes((current) => current.filter((probe) => probe.episode !== episode))
    setSelectedId(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return {
    probes,
    selectedId,
    select: setSelectedId,
    probing,
    scan,
    error,
    probe,
    startScan,
    cancelScan,
    removeProbe,
    clearEpisode,
    clearError,
  }
}
