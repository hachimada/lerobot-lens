import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../shared/api/client'
import type { Episode, SessionCreate, SessionSummary } from '../shared/api/types'

interface Options {
  onWorkspaceCleared: () => void
  onWorkspaceReady: (sessionId: string, episodes: Episode[]) => void
}

const createEmptyConfiguration = (): SessionCreate => ({
  dataset: '',
  policy: null,
  urdf: null,
  device: 'auto',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
})

function configurationForEditor(submitted: SessionCreate, created: SessionSummary): SessionCreate {
  if (!submitted.demo) return submitted
  return {
    dataset: created.dataset.replace(/\s+·\s+Episode\s+\d+$/, ''),
    policy: 'demo://dataset-trajectory-noise',
    urdf: created.has_urdf ? 'builtin://so101' : null,
    device: submitted.device,
    joint_mapping: created.joint_mapping,
    dataset_angle_unit: created.dataset_angle_unit,
    demo: true,
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

export function useWorkspaceSession({ onWorkspaceCleared, onWorkspaceReady }: Options) {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [configuration, setConfiguration] = useState<SessionCreate>(createEmptyConfiguration)
  const [loading, setLoading] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const requestGeneration = useRef(0)
  const requestController = useRef<AbortController | null>(null)

  const invalidateRequest = useCallback(() => {
    requestGeneration.current += 1
    requestController.current?.abort()
    requestController.current = null
  }, [])

  useEffect(() => invalidateRequest, [invalidateRequest])

  const closeWorkspace = useCallback(() => {
    invalidateRequest()
    onWorkspaceCleared()
    setSession(null)
    setConfiguration(createEmptyConfiguration())
    setLoading(false)
    setSettingsError(null)
  }, [invalidateRequest, onWorkspaceCleared])

  const loadSession = useCallback(
    async (payload: SessionCreate, preserveWorkspace: boolean) => {
      invalidateRequest()
      const requestId = requestGeneration.current
      const controller = new AbortController()
      requestController.current = controller
      setLoading(true)
      if (preserveWorkspace) {
        setSettingsError(null)
      } else {
        setSession(null)
        onWorkspaceCleared()
        setSettingsError(null)
      }

      try {
        let created = await api.createSession(payload, controller.signal)
        while (created.status === 'loading') {
          await new Promise((resolve) => setTimeout(resolve, 750))
          if (controller.signal.aborted || requestId !== requestGeneration.current) return
          created = await api.getSession(created.id, controller.signal)
        }
        if (controller.signal.aborted || requestId !== requestGeneration.current) return
        if (created.status === 'error') throw new Error(created.message)
        const available = await api.getEpisodes(created.id, controller.signal)
        if (controller.signal.aborted || requestId !== requestGeneration.current) return
        if (available.length === 0) throw new Error('The dataset contains no episodes.')

        onWorkspaceReady(created.id, available)
        setSettingsError(null)
        setConfiguration(configurationForEditor(payload, created))
        // Publish the session only after consumers install its initial episode state.
        setSession(created)
      } catch (cause) {
        if (
          controller.signal.aborted ||
          requestId !== requestGeneration.current ||
          isAbortError(cause)
        ) {
          return
        }
        const message = cause instanceof Error ? cause.message : 'Failed to load workspace'
        if (!preserveWorkspace) setSession(null)
        setSettingsError(message)
      } finally {
        if (requestId === requestGeneration.current) {
          requestController.current = null
          setLoading(false)
        }
      }
    },
    [invalidateRequest, onWorkspaceCleared, onWorkspaceReady],
  )

  return {
    session,
    configuration,
    loading,
    settingsError,
    loadSession,
    closeWorkspace,
  }
}
