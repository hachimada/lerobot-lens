import { ChevronDown } from 'lucide-react'

import { ActionGraphs } from '../features/evaluation/components/ActionGraphs'
import { AnalysisPanel } from '../features/evaluation/components/AnalysisPanel'
import { RobotViewer } from '../features/evaluation/components/RobotViewer'
import { Timeline } from '../features/evaluation/components/Timeline'
import { WorkspaceHeader } from '../features/evaluation/components/WorkspaceHeader'
import { ArtifactForm } from '../features/setup/ArtifactForm'
import type {
  Episode,
  EpisodeActions,
  FrameData,
  InferenceResult,
  SessionCreate,
  SessionSummary,
} from '../shared/api/types'

interface Props {
  session: SessionSummary
  configuration: SessionCreate
  loading: boolean
  settingsError: string | null
  episodes: Episode[]
  selectedEpisode: Episode | undefined
  episodeIndex: number
  frameIndex: number
  frameData: FrameData
  episodeActions: EpisodeActions | null
  playing: boolean
  speed: number
  selectedCameraKey: string
  inference: InferenceResult | null
  inferenceStep: number
  inferencePlaying: boolean
  inferenceRange?: [number, number]
  inferring: boolean
  error: string | null
  fps: number
  urdfUrl: string
  onClose: () => void
  onLoad: (payload: SessionCreate) => void
  onEpisode: (episode: number) => void
  onFrame: (frame: number) => void
  onRestart: () => void
  onPreviousFrame: () => void
  onNextFrame: () => void
  onPlaying: (playing: boolean) => void
  onSpeed: (speed: number) => void
  onCamera: (camera: string) => void
  onInfer: () => void
  onClearInference: () => void
  onInferenceStep: (step: number) => void
  onInferencePlaying: (playing: boolean) => void
}

export function EvaluationWorkspace(props: Props) {
  const {
    session,
    configuration,
    loading,
    settingsError,
    episodes,
    selectedEpisode,
    episodeIndex,
    frameIndex,
    frameData,
    episodeActions,
    playing,
    speed,
    selectedCameraKey,
    inference,
    inferenceStep,
    inferencePlaying,
    inferenceRange,
    inferring,
    error,
    fps,
    urdfUrl,
    onClose,
    onLoad,
    onEpisode,
    onFrame,
    onRestart,
    onPreviousFrame,
    onNextFrame,
    onPlaying,
    onSpeed,
    onCamera,
    onInfer,
    onClearInference,
    onInferenceStep,
    onInferencePlaying,
  } = props
  const viewerValues = inference
    ? (inference.predicted_actions[
        Math.min(inferenceStep, inference.predicted_actions.length - 1)
      ] ?? frameData.state)
    : frameData.state
  const viewerJointNames = inference ? session.action_names : session.joint_names
  const graphFrame = inference ? inference.start_frame + inferenceStep : frameIndex
  const cameraKeys = Object.keys(frameData.images)
  const activeCameraKey = cameraKeys.includes(selectedCameraKey)
    ? selectedCameraKey
    : (cameraKeys[0] ?? '')
  const activeCameraSource = activeCameraKey ? frameData.images[activeCameraKey] : null

  return (
    <div className="workspace">
      <WorkspaceHeader session={session} onClose={onClose}>
        <ArtifactForm
          key={session.id}
          initialValue={configuration}
          loading={loading}
          error={settingsError}
          onLoad={onLoad}
        />
      </WorkspaceHeader>

      <main className="workspace-main">
        <section className="content-column">
          <div className="section-bar">
            <div className="episode-select">
              <span>EPISODE</span>
              <select
                value={episodeIndex}
                onChange={(event) => onEpisode(Number(event.target.value))}
              >
                {episodes.map((episode) => (
                  <option key={episode.index} value={episode.index}>
                    #{String(episode.index).padStart(3, '0')} —{' '}
                    {episode.task || `${episode.length} frames`}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>
            <div className="episode-meta">
              <span>{selectedEpisode?.length ?? 0} FRAMES</span>
              <i />
              <span>{fps} FPS</span>
              <i />
              <span>{selectedEpisode?.duration.toFixed(1)} SEC</span>
            </div>
          </div>

          <div className={`visualization-grid ${session.has_urdf ? '' : 'camera-only'}`}>
            {session.has_urdf && (
              <div className="viewer-shell panel">
                <div className="panel-label">
                  <strong>ROBOT MOTION</strong>
                </div>
                <RobotViewer
                  url={urdfUrl}
                  values={viewerValues}
                  jointNames={viewerJointNames}
                  mapping={session.joint_mapping}
                  angleUnit={session.dataset_angle_unit ?? 'radians'}
                  mode={inference ? 'inference' : 'dataset'}
                />
                <div className="joint-readout">
                  {viewerValues.slice(0, 5).map((value, index) => (
                    <div key={index}>
                      <span>
                        {viewerJointNames[index]?.replace('.pos', '') ?? `joint_${index + 1}`}
                      </span>
                      <strong>
                        {value >= 0 ? '+' : ''}
                        {value.toFixed(3)}
                        {session.dataset_angle_unit === 'degrees' ? '°' : ' rad'}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <section className="primary-camera panel">
              <div className="primary-camera-toolbar">
                <div className="panel-label">
                  <strong>CAMERA</strong>
                  <em>{cameraKeys.length} STREAMS</em>
                </div>
                <div className="primary-camera-controls">
                  <div className="sync-badge">
                    <i /> FRAME {String(frameIndex).padStart(4, '0')}
                  </div>
                  <label className="camera-select">
                    <span>STREAM</span>
                    <select
                      aria-label="Camera stream"
                      value={activeCameraKey}
                      disabled={cameraKeys.length === 0}
                      onChange={(event) => onCamera(event.target.value)}
                    >
                      {cameraKeys.map((name) => (
                        <option value={name} key={name}>
                          {name.split('.').pop() ?? name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
              </div>
              <div className="camera-image primary-camera-image">
                {activeCameraSource ? (
                  <img src={activeCameraSource} alt={`${activeCameraKey} observation`} />
                ) : (
                  <div className="camera-empty">No camera observation</div>
                )}
                <span className="rec">● REC</span>
                <span className="frame-stamp">{frameData.timestamp.toFixed(3)} s</span>
              </div>
            </section>
          </div>

          <Timeline
            frame={frameIndex}
            length={selectedEpisode?.length ?? 1}
            fps={fps}
            playing={playing}
            speed={speed}
            inferenceRange={inferenceRange}
            onFrame={onFrame}
            onRestart={onRestart}
            onPreviousFrame={onPreviousFrame}
            onNextFrame={onNextFrame}
            onPlaying={onPlaying}
            onSpeed={onSpeed}
          />

          <section
            className={`action-graphs-section panel ${session.has_urdf ? '' : 'graph-primary'}`}
          >
            <div className="action-graphs-heading">
              <div className="panel-label">
                <strong>JOINT ACTIONS</strong>
                <em>DATASET × POLICY</em>
              </div>
              <div className="graph-legend">
                <span>
                  <i className="dashed" /> DATASET · FULL EPISODE
                </span>
                <span>
                  <i className="solid" /> PREDICTION · ACTION CHUNK
                </span>
              </div>
            </div>
            <ActionGraphs
              episodeActions={episodeActions}
              inference={inference}
              currentFrame={graphFrame}
            />
          </section>
        </section>

        <AnalysisPanel
          session={session}
          episodeIndex={episodeIndex}
          frameIndex={frameIndex}
          frameData={frameData}
          inference={inference}
          inferenceStep={inferenceStep}
          inferencePlaying={inferencePlaying}
          inferring={inferring}
          error={error}
          onInfer={onInfer}
          onClearInference={onClearInference}
          onInferenceStep={onInferenceStep}
          onInferencePlaying={onInferencePlaying}
        />
      </main>
    </div>
  )
}
