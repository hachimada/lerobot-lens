import { useCallback, useEffect, useMemo, useState } from 'react'

import { CameraGrid } from '../features/workspace/CameraGrid'
import { ChunkPlayer } from '../features/workspace/ChunkPlayer'
import type { EpisodeProbeSummary } from '../features/workspace/EpisodeBrowser'
import { EpisodeBrowser } from '../features/workspace/EpisodeBrowser'
import { JointCharts } from '../features/workspace/JointCharts'
import { frameRange } from '../features/workspace/labels'
import { ProbeInspector } from '../features/workspace/ProbeInspector'
import { ProbeToolbar } from '../features/workspace/ProbeToolbar'
import { ProbeTrack } from '../features/workspace/ProbeTrack'
import type { Probe, ProbeView } from '../features/workspace/probes'
import {
  chunkAt,
  episodeRanges,
  errorLevel,
  probeMetrics,
  scanFrames,
  stepAt,
  toChunk,
  toProbeView,
} from '../features/workspace/probes'
import { RecordingTimeline } from '../features/workspace/RecordingTimeline'
import type { RobotPose } from '../features/workspace/RobotViewer'
import { RobotViewer } from '../features/workspace/RobotViewer'
import { ShortcutsDialog } from '../features/workspace/ShortcutsDialog'
import { TopBar } from '../features/workspace/TopBar'
import { TransportBar } from '../features/workspace/TransportBar'
import { api } from '../shared/api/client'
import type { Episode, SessionSummary } from '../shared/api/types'
import { padEpisode } from '../shared/lib/format'
import { ArtifactLabel } from '../shared/ui/ArtifactLabel'
import type { ChunkStart } from './useChunkReplay'
import { useChunkReplay } from './useChunkReplay'
import { useEpisodeData } from './useEpisodeData'
import type { ShortcutAction } from './useKeyboardShortcuts'
import { keepFocusOffButtons, useKeyboardShortcuts } from './useKeyboardShortcuts'
import { usePlayback } from './usePlayback'
import { useProbes } from './useProbes'
import type { Theme } from './useTheme'
import styles from './Workspace.module.css'

interface Props {
  session: SessionSummary
  episodes: Episode[]
  theme: Theme
  shortcutsEnabled: boolean
  onToggleTheme: () => void
  onHome: () => void
  onEditSession: () => void
}

interface OpenOptions {
  play?: boolean
  step?: number
  through?: boolean
}

/**
 * The inspection workspace. The recording and the probe results have separate
 * timelines; the stage (cameras and robot model) shows whichever one was used
 * last, so playing the recording never changes which probe is selected.
 */
export function Workspace({
  session,
  episodes,
  theme,
  shortcutsEnabled,
  onToggleTheme,
  onHome,
  onEditSession,
}: Props) {
  const [episodeIndex, setEpisodeIndex] = useState(episodes[0].index)
  /** The recording position, kept while the stage shows a probe. */
  const [frameIndex, setFrameIndex] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const fps = session.fps ?? 30
  const hasPolicy = session.demo || !!session.policy
  const position = Math.max(
    0,
    episodes.findIndex((episode) => episode.index === episodeIndex),
  )
  const episode = episodes[position]
  const frameCount = episode.length

  const probes = useProbes(session.id)
  const { probes: allProbes, selectedId, select, scan } = probes

  // This episode's chunks in time order. Equal starts keep inference order, so
  // the later inference wins in chunkAt.
  const episodeChunks = useMemo(
    () =>
      allProbes
        .filter((probe) => probe.episode === episodeIndex)
        .map(toChunk)
        .sort((left, right) => left.startFrame - right.startFrame),
    [allProbes, episodeIndex],
  )

  /** Playing the chunks through the episode: what to show after a step (see chunkAt). */
  function nextChunk(probeId: string, step: number): ChunkStart | null {
    const current = episodeChunks.find((chunk) => chunk.id === probeId)
    const found = current && chunkAt(episodeChunks, current.startFrame + step + 1)
    return found ? { probeId: found.chunk.id, step: found.step, steps: found.chunk.steps } : null
  }
  const chunk = useChunkReplay(fps * speed, { next: nextChunk, onChange: select })

  // What the stage shows: a chunk of this episode being replayed, or else the recording.
  const shown = episodeChunks.find((item) => item.id === chunk.replay?.probeId) ?? null
  const replay = shown ? chunk.replay : null
  const shownStep = replay?.step ?? 0
  const stepFrame = shown ? shown.startFrame + shownStep : undefined
  // While a chunk is on the stage, the cameras hold the frame the policy observed.
  const stageFrame = shown ? shown.startFrame : frameIndex

  const { frameData, frameLoading, episodeActions, error, clearError } = useEpisodeData({
    sessionId: session.id,
    episodeIndex,
    frameIndex: stageFrame,
  })
  // The frame whose camera images are on screen. The robot model and charts
  // follow it rather than the requested frame, so they never run ahead of the
  // camera while the next frame decodes.
  const frameOnScreen = frameData.episode === episodeIndex
  const displayFrame = frameOnScreen ? frameData.frame : stageFrame
  const playback = usePlayback({
    frame: frameIndex,
    frameCount,
    fps,
    speed,
    onFrame: setFrameIndex,
    ready: !shown && frameOnScreen && frameData.frame === frameIndex,
  })

  const recordedActions = episodeActions?.episode === episodeIndex ? episodeActions.actions : null
  const dimensions = Math.max(session.action_names.length, recordedActions?.[0]?.length ?? 0)

  const episodeProbes = useMemo<ProbeView[]>(() => {
    const ranges = episodeRanges(episodeChunks, recordedActions, dimensions)
    return episodeChunks.map((item) => toProbeView(item, ranges))
  }, [dimensions, episodeChunks, recordedActions])

  const episodeSummaries = useMemo(() => {
    const grouped = new Map<number, Probe[]>()
    for (const probe of allProbes) {
      const group = grouped.get(probe.episode)
      if (group) group.push(probe)
      else grouped.set(probe.episode, [probe])
    }
    const summaries = new Map<number, EpisodeProbeSummary>()
    for (const [index, group] of grouped) {
      // The open episode reuses its views; the others have only their probes' recorded actions.
      let errors: number[]
      if (index === episodeIndex) {
        errors = episodeProbes.map((probe) => probe.metrics.normalizedError)
      } else {
        const ranges = episodeRanges(group, null, dimensions)
        errors = group.map((probe) => probeMetrics(probe.result, ranges).normalizedError)
      }
      const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length
      summaries.set(index, { count: errors.length, level: errorLevel(mean) })
    }
    return summaries
  }, [allProbes, dimensions, episodeIndex, episodeProbes])

  // The user picks the selected probe; playing all chunks moves it along, the recording never does.
  const selectedProbe = episodeProbes.find((probe) => probe.id === selectedId) ?? null

  const predictedAction = shown?.result.predicted_actions[shownStep]
  const recordedAction = shown?.result.ground_truth_actions[shownStep]
  const pose = useMemo<RobotPose>(
    () =>
      predictedAction
        ? { values: predictedAction, jointNames: session.action_names }
        : { values: frameData.state, jointNames: session.joint_names },
    [frameData.state, predictedAction, session.action_names, session.joint_names],
  )
  const ghost = useMemo<RobotPose | null>(
    () =>
      predictedAction && recordedAction
        ? { values: recordedAction, jointNames: session.action_names }
        : null,
    [predictedAction, recordedAction, session.action_names],
  )
  const policyLabel = useMemo(
    () =>
      session.demo ? 'Demo policy (noisy replay)' : <ArtifactLabel reference={session.policy} />,
    [session.demo, session.policy],
  )

  const { pause, seek, step: stepFrames, toggle } = playback
  const {
    start: startReplay,
    exit: showRecording,
    play: playReplay,
    pause: pauseReplay,
    seekStep,
  } = chunk

  // A frame that fails to decode would otherwise stall frame-locked playback.
  useEffect(() => {
    if (error) pause()
  }, [error, pause])

  /** Select a probe and put it on the stage, paused at its first step unless told otherwise. */
  const openProbe = useCallback(
    (probe: { id: string; steps: number }, options?: OpenOptions) => {
      pause()
      select(probe.id)
      startReplay(probe.id, probe.steps, { play: false, ...options })
    },
    [pause, select, startReplay],
  )

  const selectEpisode = useCallback(
    (index: number) => {
      showRecording()
      pause()
      clearError()
      setEpisodeIndex(index)
      setFrameIndex(0)
      select(null)
    },
    [clearError, pause, select, showRecording],
  )

  /** The chunk player's own button, and R: this chunk alone. */
  function toggleChunk() {
    if (replay?.playing) pauseReplay()
    else if (replay) playReplay(false)
    else if (selectedProbe) openProbe(selectedProbe, { play: true })
  }

  /**
   * The chunks through the episode: on from the chunk on the stage, or from
   * the start when the stage shows the recording or playback reached the end.
   */
  function playAllChunks() {
    if (replay?.playing && replay.through) return pauseReplay()
    if (replay && nextChunk(replay.probeId, replay.step)) return playReplay(true)
    const first = chunkAt(episodeChunks, 0)
    if (first) openProbe(first.chunk, { play: true, step: first.step, through: true })
  }

  function seekChunkStep(step: number) {
    if (!shown && selectedProbe) openProbe(selectedProbe)
    seekStep(step)
  }

  function removeProbe(id: string) {
    // The stage returns to the recording when its chunk goes away.
    if (id === shown?.id) showRecording()
    probes.removeProbe(id)
  }

  function clearEpisodeProbes() {
    showRecording()
    probes.clearEpisode(episodeIndex)
  }

  function probeWholeEpisode(stride: number) {
    pause()
    void probes.startScan(episodeIndex, scanFrames(frameCount, stride))
  }

  async function probeRecordingFrame() {
    if (!hasPolicy || scan || probes.probing) return
    pause()
    const created = await probes.probe(episodeIndex, frameIndex)
    // Show the new prediction right away, replaying from the probed frame.
    if (created) openProbe(toChunk(created), { play: true })
  }

  /** Seek the recording; the stage switches back to it. */
  function seekRecording(frame: number) {
    showRecording()
    seek(frame)
  }

  /** Charts share both timelines: inside the chunk on the stage they move its step. */
  function seekFromChart(frame: number) {
    const step = shown ? stepAt(shown, frame) : null
    if (step === null) seekRecording(frame)
    else seekStep(step)
  }

  function toggleRecording() {
    showRecording()
    toggle()
  }

  function stepRecording(delta: number) {
    showRecording()
    stepFrames(delta)
  }

  /** Playback keys drive whichever timeline is on the stage. */
  function moveStage(delta: number) {
    if (replay) seekStep(replay.step + delta)
    else stepFrames(delta)
  }

  function jumpStage(toEnd: boolean) {
    if (replay) return seekStep(toEnd ? replay.steps - 1 : 0)
    pause()
    seek(toEnd ? frameCount - 1 : 0)
  }

  function onShortcut(action: ShortcutAction) {
    switch (action) {
      case 'toggle-play':
        if (!replay) return toggle()
        return replay.through ? playAllChunks() : toggleChunk()
      case 'previous-frame':
        return moveStage(-1)
      case 'next-frame':
        return moveStage(1)
      case 'back-10':
        return moveStage(-10)
      case 'forward-10':
        return moveStage(10)
      case 'first-frame':
        return jumpStage(false)
      case 'last-frame':
        return jumpStage(true)
      case 'previous-episode':
        if (position > 0) selectEpisode(episodes[position - 1].index)
        return
      case 'next-episode':
        if (position < episodes.length - 1) selectEpisode(episodes[position + 1].index)
        return
      case 'probe':
        return void probeRecordingFrame()
      case 'replay':
        return toggleChunk()
      case 'remove-probe':
        if (selectedProbe) removeProbe(selectedProbe.id)
        return
      case 'help':
        return setShortcutsOpen(true)
      case 'escape':
        return showRecording()
    }
  }
  useKeyboardShortcuts(onShortcut, shortcutsEnabled && !shortcutsOpen)

  return (
    <div
      className={styles.workspace}
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      onMouseDown={keepFocusOffButtons}
    >
      <TopBar
        session={session}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onHome={onHome}
        onEditSession={onEditSession}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      <div className={styles.body}>
        {sidebarOpen && (
          <div className={styles.sidebar}>
            <EpisodeBrowser
              episodes={episodes}
              selectedIndex={episodeIndex}
              summaries={episodeSummaries}
              onSelect={selectEpisode}
            />
          </div>
        )}

        <main className={styles.main}>
          <div className={styles.episodeHeader}>
            <h1>
              Episode <span className="mono">{padEpisode(episodeIndex)}</span>
            </h1>
            {episode.task && <p title={episode.task}>{episode.task}</p>}
            <div className={`segmented ${styles.viewSwitch}`} role="group" aria-label="Stage shows">
              <button type="button" aria-pressed={!shown} onClick={showRecording}>
                Recording <span className="mono">· frame {frameIndex}</span>
              </button>
              <button
                type="button"
                aria-pressed={!!shown}
                disabled={!selectedProbe}
                title={selectedProbe ? undefined : 'Select a probe chunk first'}
                onClick={() => selectedProbe && openProbe(selectedProbe)}
              >
                Probe
                {selectedProbe && (
                  <span className="mono">
                    {' '}
                    {frameRange(selectedProbe)} · step {shownStep + 1}/{selectedProbe.steps}
                  </span>
                )}
              </button>
            </div>
          </div>

          <section className={styles.stage} data-has-robot={session.has_urdf}>
            {session.has_urdf && (
              <div className={styles.viewerPane}>
                <div className={styles.poseLegend}>
                  {shown ? (
                    <>
                      <span className={styles.predictedTag}>
                        Predicted action · step {shownStep + 1}/{shown.steps}
                      </span>
                      <span className={styles.ghostTag}>Recorded action</span>
                    </>
                  ) : (
                    <span className={styles.observedTag}>Observed state</span>
                  )}
                </div>
                <RobotViewer
                  url={api.urdfUrl(session.id)}
                  assetsUrl={api.assetsUrl(session.id)}
                  pose={pose}
                  ghost={ghost}
                  mapping={session.joint_mapping}
                  angleUnit={session.dataset_angle_unit ?? 'radians'}
                  theme={theme}
                />
              </div>
            )}
            <div className={styles.cameraPane}>
              <CameraGrid
                images={frameData.images}
                timestamp={frameData.timestamp}
                loading={frameLoading}
                note={shown ? `Policy input · frame ${shown.startFrame}` : undefined}
              />
            </div>
          </section>

          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}

          <section
            className={`${styles.panel} ${styles.recordingPanel}`}
            aria-labelledby="recording-title"
            data-active={!shown}
          >
            <h2 id="recording-title" className={styles.panelTitle}>
              Recording
            </h2>
            <TransportBar
              frame={frameIndex}
              frameCount={frameCount}
              fps={fps}
              playing={playback.playing}
              speed={speed}
              onToggle={toggleRecording}
              onStep={stepRecording}
              onSpeed={setSpeed}
            >
              <RecordingTimeline
                frame={frameIndex}
                frameCount={frameCount}
                fps={fps}
                onSeek={seekRecording}
              />
            </TransportBar>
          </section>

          <section className={styles.panel} aria-labelledby="probes-title" data-active={!!shown}>
            <div className={styles.panelHeader}>
              <h2 id="probes-title" className={styles.panelTitle}>
                Probes
              </h2>
              {hasPolicy && episodeProbes.length > 0 && (
                <span className={styles.panelMeta}>
                  {episodeProbes.length} in this episode · click a chunk to inspect it
                </span>
              )}
            </div>
            <ProbeToolbar
              hasPolicy={hasPolicy}
              frame={frameIndex}
              frameCount={frameCount}
              chunkSize={session.action_chunk_size ?? episodeChunks[0]?.result.chunk_size ?? null}
              probeCount={episodeProbes.length}
              probing={probes.probing}
              scan={scan}
              error={probes.error}
              onProbe={() => void probeRecordingFrame()}
              onScan={probeWholeEpisode}
              onCancelScan={probes.cancelScan}
              onClearAll={clearEpisodeProbes}
              onDismissError={probes.clearError}
              onAddPolicy={onEditSession}
            />
            {hasPolicy && (
              <>
                {(episodeProbes.length > 0 || scan) && (
                  <ProbeTrack
                    probes={episodeProbes}
                    selectedId={selectedProbe?.id ?? null}
                    frameCount={frameCount}
                    recordingFrame={frameIndex}
                    stepFrame={stepFrame}
                    onSelect={openProbe}
                  />
                )}
                <ChunkPlayer
                  probe={selectedProbe}
                  count={episodeProbes.length}
                  active={!!shown}
                  step={shownStep}
                  playing={!!replay?.playing}
                  playingAll={!!replay?.playing && replay.through}
                  onTogglePlay={toggleChunk}
                  onPlayAll={playAllChunks}
                  onSeekStep={seekChunkStep}
                  onRemove={removeProbe}
                />
              </>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="joint-actions-title">
            <h2 id="joint-actions-title" className={styles.panelTitle}>
              Joint actions
            </h2>
            <JointCharts
              actionNames={session.action_names}
              recorded={recordedActions}
              probes={episodeProbes}
              focus={selectedProbe}
              focusStep={shown ? shownStep : null}
              frame={stepFrame ?? displayFrame}
              frameCount={frameCount}
              onSeek={seekFromChart}
            />
          </section>
        </main>

        <div className={styles.inspector}>
          <ProbeInspector
            hasPolicy={hasPolicy}
            policyLabel={policyLabel}
            device={session.device}
            focus={selectedProbe}
            probes={episodeProbes}
            actionNames={session.action_names}
            onSelect={openProbe}
          />
        </div>
      </div>
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
