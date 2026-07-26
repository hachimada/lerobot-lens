import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../shared/api/client'
import type { Episode } from '../shared/api/types'
import { EvaluationWorkspace } from './EvaluationWorkspace'
import { OnboardingScreen } from './OnboardingScreen'
import { useEpisodeData } from './useEpisodeData'
import { useInference } from './useInference'
import { usePlayback } from './usePlayback'
import { useWorkspaceSession } from './useWorkspaceSession'

export default function App() {
  const [episodeIndex, setEpisodeIndex] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [selectedCameraKey, setSelectedCameraKey] = useState('')

  const {
    episodes,
    selectedEpisode,
    frameData,
    episodeActions,
    error: episodeError,
    installWorkspace: installEpisodeWorkspace,
    reset: resetEpisodeData,
    clearError: clearEpisodeError,
  } = useEpisodeData({ episodeIndex, frameIndex })

  const resetEvaluationRef = useRef<() => void>(() => undefined)
  const resetEvaluationState = useCallback(() => resetEvaluationRef.current(), [])

  const installWorkspaceEpisodes = useCallback(
    (sessionId: string, available: Episode[]) => {
      resetEvaluationState()
      setEpisodeIndex(available[0].index)
      installEpisodeWorkspace(sessionId, available)
    },
    [installEpisodeWorkspace, resetEvaluationState],
  )

  const clearWorkspaceData = useCallback(() => {
    resetEpisodeData()
    resetEvaluationState()
  }, [resetEpisodeData, resetEvaluationState])

  const { session, configuration, loading, settingsError, loadSession, closeWorkspace } =
    useWorkspaceSession({
      onWorkspaceCleared: clearWorkspaceData,
      onWorkspaceReady: installWorkspaceEpisodes,
    })

  const fps = session?.fps ?? 30

  const {
    playing,
    speed,
    inferenceStep,
    inferencePlaying,
    inferenceRange,
    setPlaying,
    setSpeed,
    setInferencePlaying,
    setChunkStep,
    seek,
    restart: restartPlayback,
    previous,
    next,
    stopEpisode,
    startChunk,
    clearChunk,
    reset: resetPlayback,
  } = usePlayback({
    frame: frameIndex,
    frameCount: selectedEpisode?.length ?? 1,
    episodeFps: fps,
    onFrame: setFrameIndex,
  })

  const handleInferenceStart = useCallback(() => {
    stopEpisode()
    clearEpisodeError()
  }, [clearEpisodeError, stopEpisode])

  const {
    inference,
    inferring,
    error: inferenceError,
    run: runInference,
    clear: clearInference,
    reset: resetInference,
  } = useInference({
    onStart: handleInferenceStart,
    onResult: startChunk,
    onClear: clearChunk,
  })

  useEffect(() => {
    resetEvaluationRef.current = () => {
      setEpisodeIndex(0)
      setFrameIndex(0)
      setSelectedCameraKey('')
      resetPlayback()
      resetInference()
    }
  }, [resetInference, resetPlayback])

  const returnToOnboarding = () => {
    closeWorkspace()
    resetPlayback(true)
  }

  const runSelectedInference = () => {
    if (!session) return
    void runInference(session.id, episodeIndex, frameIndex)
  }

  const selectEpisode = (episode: number) => {
    stopEpisode()
    setEpisodeIndex(episode)
    setFrameIndex(0)
    clearInference()
  }

  const selectFrame = (frame: number) => {
    seek(frame)
    clearInference()
  }

  const restart = () => {
    restartPlayback()
    clearInference()
  }

  const previousFrame = () => {
    previous()
    clearInference()
  }

  const nextFrame = () => {
    next()
    clearInference()
  }

  if (!session || session.status !== 'ready') {
    return (
      <OnboardingScreen
        configuration={configuration}
        loading={loading}
        error={settingsError}
        onLoad={(payload) => {
          void loadSession(payload, false)
        }}
      />
    )
  }

  return (
    <EvaluationWorkspace
      session={session}
      configuration={configuration}
      loading={loading}
      settingsError={settingsError}
      episodes={episodes}
      selectedEpisode={selectedEpisode}
      episodeIndex={episodeIndex}
      frameIndex={frameIndex}
      frameData={frameData}
      episodeActions={episodeActions}
      playing={playing}
      speed={speed}
      selectedCameraKey={selectedCameraKey}
      inference={inference}
      inferenceStep={inferenceStep}
      inferencePlaying={inferencePlaying}
      inferenceRange={inferenceRange}
      inferring={inferring}
      error={inferenceError ?? episodeError}
      fps={fps}
      urdfUrl={api.urdfUrl(session.id)}
      onClose={returnToOnboarding}
      onLoad={(payload) => {
        void loadSession(payload, true)
      }}
      onEpisode={selectEpisode}
      onFrame={selectFrame}
      onRestart={restart}
      onPreviousFrame={previousFrame}
      onNextFrame={nextFrame}
      onPlaying={setPlaying}
      onSpeed={setSpeed}
      onCamera={setSelectedCameraKey}
      onInfer={runSelectedInference}
      onClearInference={clearInference}
      onInferenceStep={setChunkStep}
      onInferencePlaying={setInferencePlaying}
    />
  )
}
