import { useCallback, useEffect, useState } from 'react'

import { api } from '../shared/api/client'
import type { EpisodeActions, FrameData } from '../shared/api/types'
import { errorMessage, isAbortError } from '../shared/lib/errors'

interface Options {
  sessionId: string
  episodeIndex: number
  frameIndex: number
}

/** Placeholder until the first frame decodes; episode -1 matches no real episode. */
export const EMPTY_FRAME: FrameData = {
  episode: -1,
  frame: 0,
  timestamp: 0,
  state: [],
  action: [],
  images: {},
}

/** Decoded frames and recorded actions for an episode. */
export function useEpisodeData({ sessionId, episodeIndex, frameIndex }: Options) {
  const [frameData, setFrameData] = useState<FrameData>(EMPTY_FRAME)
  const [episodeActions, setEpisodeActions] = useState<EpisodeActions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .getFrame(sessionId, episodeIndex, frameIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setFrameData(data)
      })
      .catch((cause) => {
        if (controller.signal.aborted || isAbortError(cause)) return
        setError(errorMessage(cause, 'Failed to decode frame'))
      })
    return () => controller.abort()
  }, [episodeIndex, frameIndex, sessionId])

  useEffect(() => {
    const controller = new AbortController()
    setEpisodeActions(null)
    api
      .getEpisodeActions(sessionId, episodeIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEpisodeActions(data)
      })
      .catch((cause) => {
        if (controller.signal.aborted || isAbortError(cause)) return
        setError(errorMessage(cause, 'Failed to load episode actions'))
      })
    return () => controller.abort()
  }, [episodeIndex, sessionId])

  const clearError = useCallback(() => setError(null), [])
  // Derived rather than stored, so a frame costs one render, not three.
  const frameLoading =
    !error && (frameData.episode !== episodeIndex || frameData.frame !== frameIndex)

  return { frameData, frameLoading, episodeActions, error, clearError }
}
