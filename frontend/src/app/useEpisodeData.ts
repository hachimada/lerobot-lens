import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../shared/api/client'
import type { Episode, EpisodeActions, FrameData } from '../shared/api/types'

interface Options {
  episodeIndex: number
  frameIndex: number
}

const emptyFrame: FrameData = {
  episode: 0,
  frame: 0,
  timestamp: 0,
  state: [],
  action: [],
  images: {},
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

export function useEpisodeData({ episodeIndex, frameIndex }: Options) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [frameData, setFrameData] = useState<FrameData>(emptyFrame)
  const [episodeActions, setEpisodeActions] = useState<EpisodeActions | null>(null)
  const [frameLoading, setFrameLoading] = useState(false)
  const [actionsLoading, setActionsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameRequest = useRef<AbortController | null>(null)
  const actionsRequest = useRef<AbortController | null>(null)
  const requestGeneration = useRef(0)

  const selectedEpisode = useMemo(
    () => episodes.find((episode) => episode.index === episodeIndex) ?? episodes[0],
    [episodeIndex, episodes],
  )

  const abortRequests = useCallback(() => {
    requestGeneration.current += 1
    frameRequest.current?.abort()
    actionsRequest.current?.abort()
    frameRequest.current = null
    actionsRequest.current = null
  }, [])

  useEffect(() => abortRequests, [abortRequests])

  const reset = useCallback(() => {
    abortRequests()
    setSessionId(null)
    setEpisodes([])
    setFrameData(emptyFrame)
    setEpisodeActions(null)
    setFrameLoading(false)
    setActionsLoading(false)
    setError(null)
  }, [abortRequests])

  const installWorkspace = useCallback(
    (nextSessionId: string, available: Episode[]) => {
      abortRequests()
      setSessionId(nextSessionId)
      setEpisodes(available)
      setFrameData(emptyFrame)
      setEpisodeActions(null)
      setFrameLoading(false)
      setActionsLoading(false)
      setError(null)
    },
    [abortRequests],
  )

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    if (!sessionId || !selectedEpisode) return
    const controller = new AbortController()
    const requestId = requestGeneration.current
    frameRequest.current?.abort()
    frameRequest.current = controller
    setFrameLoading(true)

    api
      .getFrame(sessionId, selectedEpisode.index, frameIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && requestId === requestGeneration.current) {
          setFrameData(data)
        }
      })
      .catch((cause) => {
        if (
          !controller.signal.aborted &&
          requestId === requestGeneration.current &&
          !isAbortError(cause)
        ) {
          setError(cause instanceof Error ? cause.message : 'Failed to decode frame')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestGeneration.current) {
          setFrameLoading(false)
        }
      })

    return () => controller.abort()
  }, [frameIndex, selectedEpisode, sessionId])

  useEffect(() => {
    if (!sessionId || !selectedEpisode) return
    const controller = new AbortController()
    const requestId = requestGeneration.current
    actionsRequest.current?.abort()
    actionsRequest.current = controller
    setEpisodeActions(null)
    setActionsLoading(true)

    api
      .getEpisodeActions(sessionId, selectedEpisode.index, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted && requestId === requestGeneration.current) {
          setEpisodeActions(data)
        }
      })
      .catch((cause) => {
        if (
          !controller.signal.aborted &&
          requestId === requestGeneration.current &&
          !isAbortError(cause)
        ) {
          setError(cause instanceof Error ? cause.message : 'Failed to load episode actions')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === requestGeneration.current) {
          setActionsLoading(false)
        }
      })

    return () => controller.abort()
  }, [selectedEpisode, sessionId])

  return {
    episodes,
    selectedEpisode,
    frameData,
    episodeActions,
    loading: frameLoading || actionsLoading,
    error,
    installWorkspace,
    reset,
    clearError,
  }
}
