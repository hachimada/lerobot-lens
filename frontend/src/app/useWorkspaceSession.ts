import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../shared/api/client'
import { errorMessage, isAbortError } from '../shared/lib/errors'
import type { Episode, SessionCreate, SessionSummary } from '../shared/api/types'

export interface LoadingState {
  message: string
  startedAt: number
  hasPolicy: boolean
}

export const DEMO_POLICY = 'demo://dataset-trajectory-noise'

export const createEmptyConfiguration = (): SessionCreate => ({
  dataset: '',
  policy: null,
  urdf: null,
  device: 'auto',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
})

export const DEMO_CONFIGURATION: SessionCreate = {
  ...createEmptyConfiguration(),
  dataset: 'demo',
  demo: true,
}

function configurationForEditor(submitted: SessionCreate, created: SessionSummary): SessionCreate {
  if (!submitted.demo) return submitted
  return {
    dataset: created.dataset.replace(/\s+·\s+Episode\s+\d+$/, ''),
    policy: DEMO_POLICY,
    urdf: created.has_urdf ? 'builtin://so101' : null,
    device: submitted.device,
    joint_mapping: created.joint_mapping,
    dataset_angle_unit: created.dataset_angle_unit,
    demo: true,
  }
}

const POLL_INTERVAL_MS = 750

/**
 * Creates sessions and polls them until ready. A session being replaced stays
 * on screen until its successor is ready, so a failed load never strands the user.
 */
export function useWorkspaceSession() {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [configuration, setConfiguration] = useState<SessionCreate>(createEmptyConfiguration)
  const [loading, setLoading] = useState<LoadingState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  useEffect(() => abort, [abort])

  const cancelLoading = useCallback(() => {
    abort()
    setLoading(null)
  }, [abort])

  const closeSession = useCallback(() => {
    abort()
    setSession(null)
    setEpisodes([])
    setLoading(null)
    setError(null)
  }, [abort])

  const loadSession = useCallback(
    async (payload: SessionCreate): Promise<boolean> => {
      abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const hasPolicy = payload.demo || !!payload.policy
      setError(null)
      setLoading({ message: 'Starting session…', startedAt: Date.now(), hasPolicy })

      try {
        let created = await api.createSession(payload, controller.signal)
        while (created.status === 'loading') {
          const message = created.message
          setLoading((current) => (current ? { ...current, message } : current))
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
          if (controller.signal.aborted) return false
          created = await api.getSession(created.id, controller.signal)
        }
        if (created.status === 'error') throw new Error(created.message)
        const available = await api.getEpisodes(created.id, controller.signal)
        if (controller.signal.aborted) return false
        if (available.length === 0) throw new Error('The dataset contains no episodes.')

        setEpisodes(available)
        setConfiguration(configurationForEditor(payload, created))
        setSession(created)
        return true
      } catch (cause) {
        if (controller.signal.aborted || isAbortError(cause)) return false
        setError(errorMessage(cause, 'Failed to load the session'))
        return false
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null
          setLoading(null)
        }
      }
    },
    [abort],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    session,
    episodes,
    configuration,
    loading,
    error,
    loadSession,
    cancelLoading,
    closeSession,
    clearError,
  }
}
