import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { ActionGraphs } from '../features/evaluation/components/ActionGraphs'
import { AnalysisPanel } from '../features/evaluation/components/AnalysisPanel'
import { RobotViewer } from '../features/evaluation/components/RobotViewer'
import { Timeline } from '../features/evaluation/components/Timeline'
import { WorkspaceHeader } from '../features/evaluation/components/WorkspaceHeader'
import { LoadScreen } from '../features/setup/LoadScreen'
import { api } from '../shared/api/client'
import type {
  Episode,
  EpisodeActions,
  FrameData,
  InferenceResult,
  SessionCreate,
  SessionSummary,
} from '../shared/api/types'

const emptyFrame: FrameData = {
  episode: 0,
  frame: 0,
  timestamp: 0,
  state: [],
  action: [],
  images: {},
}

export default function App() {
  const [session, setSession] = useState<SessionSummary | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [episodeIndex, setEpisodeIndex] = useState(0)
  const [frameIndex, setFrameIndex] = useState(0)
  const [frameData, setFrameData] = useState(emptyFrame)
  const [episodeActions, setEpisodeActions] = useState<EpisodeActions | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [selectedCameraKey, setSelectedCameraKey] = useState('')
  const [inference, setInference] = useState<InferenceResult | null>(null)
  const [inferenceStep, setInferenceStep] = useState(0)
  const [inferencePlaying, setInferencePlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inferring, setInferring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const frameRequest = useRef<AbortController | null>(null)
  const actionsRequest = useRef<AbortController | null>(null)

  const selectedEpisode = episodes.find((episode) => episode.index === episodeIndex) ?? episodes[0]
  const fps = session?.fps ?? 30

  const loadSession = async (payload: SessionCreate) => {
    setLoading(true)
    setError(null)
    setSession(null)
    setEpisodes([])
    setEpisodeIndex(0)
    setFrameIndex(0)
    setFrameData(emptyFrame)
    setEpisodeActions(null)
    setSelectedCameraKey('')
    setInference(null)
    setPlaying(false)
    setInferencePlaying(false)
    try {
      let created = await api.createSession(payload)
      while (created.status === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 750))
        created = await api.getSession(created.id)
      }
      if (created.status === 'error') throw new Error(created.message)
      const available = await api.getEpisodes(created.id)
      if (available.length === 0) throw new Error('The dataset contains no episodes.')
      setEpisodes(available)
      setEpisodeIndex(available[0].index)
      // Publish the ready session only after its episode state is installed.
      // Otherwise effects can request an episode retained from the previous session.
      setSession(created)
    } catch (cause) {
      setSession(null)
      setError(cause instanceof Error ? cause.message : 'Failed to load workspace')
    } finally {
      setLoading(false)
    }
  }

  const fetchFrame = useCallback(
    async (episode: number, frame: number) => {
      if (!session?.id) return
      frameRequest.current?.abort()
      const controller = new AbortController()
      frameRequest.current = controller
      try {
        const data = await api.getFrame(session.id, episode, frame, controller.signal)
        if (controller.signal.aborted) return
        setFrameData(data)
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Failed to decode frame')
        }
      }
    },
    [session?.id],
  )

  useEffect(() => {
    if (selectedEpisode) void fetchFrame(episodeIndex, frameIndex)
    return () => frameRequest.current?.abort()
  }, [episodeIndex, frameIndex, selectedEpisode, fetchFrame])

  useEffect(() => {
    if (!session?.id || !selectedEpisode) return
    actionsRequest.current?.abort()
    const controller = new AbortController()
    actionsRequest.current = controller
    setEpisodeActions(null)
    api
      .getEpisodeActions(session.id, episodeIndex, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEpisodeActions(data)
      })
      .catch((cause) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : 'Failed to load episode actions')
        }
      })
    return () => controller.abort()
  }, [session?.id, episodeIndex, selectedEpisode])

  useEffect(() => {
    if (!playing || !selectedEpisode) return
    const timer = window.setInterval(
      () => {
        setFrameIndex((current) => {
          if (current >= selectedEpisode.length - 1) {
            setPlaying(false)
            return current
          }
          return current + 1
        })
      },
      1000 / fps / speed,
    )
    return () => clearInterval(timer)
  }, [playing, selectedEpisode, fps, speed])

  useEffect(() => {
    if (!inferencePlaying || !inference) return
    const timer = window.setInterval(() => {
      setInferenceStep((current) => {
        if (current >= inference.chunk_size - 1) {
          setInferencePlaying(false)
          return current
        }
        return current + 1
      })
    }, 1000 / inference.fps)
    return () => clearInterval(timer)
  }, [inferencePlaying, inference])

  const runInference = async () => {
    if (!session) return
    setInferring(true)
    setPlaying(false)
    setError(null)
    try {
      const result = await api.infer(session.id, episodeIndex, frameIndex)
      setInference(result)
      setInferenceStep(0)
      setInferencePlaying(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inference failed')
    } finally {
      setInferring(false)
    }
  }

  if (!session || session.status !== 'ready') {
    return <LoadScreen loading={loading} error={error} onLoad={loadSession} />
  }

  const viewerValues = inference
    ? (inference.predicted_actions[
        Math.min(inferenceStep, inference.predicted_actions.length - 1)
      ] ?? frameData.state)
    : frameData.state
  const viewerJointNames = inference ? session.action_names : session.joint_names
  const chunkRange: [number, number] | undefined = inference
    ? [inference.start_frame, inference.start_frame + inference.chunk_size]
    : undefined
  const graphFrame = inference ? inference.start_frame + inferenceStep : frameIndex
  const cameraKeys = Object.keys(frameData.images)
  const activeCameraKey = cameraKeys.includes(selectedCameraKey)
    ? selectedCameraKey
    : (cameraKeys[0] ?? '')
  const activeCameraSource = activeCameraKey ? frameData.images[activeCameraKey] : null

  return (
    <div className="workspace">
      <WorkspaceHeader session={session} onClose={() => setSession(null)} />

      <main className="workspace-main">
        <section className="content-column">
          <div className="section-bar">
            <div className="episode-select">
              <span>EPISODE</span>
              <select
                value={episodeIndex}
                onChange={(e) => {
                  setEpisodeIndex(Number(e.target.value))
                  setFrameIndex(0)
                  setInference(null)
                }}
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
                  url={api.urdfUrl(session.id)}
                  values={viewerValues}
                  jointNames={viewerJointNames}
                  mapping={session.joint_mapping}
                  angleUnit={session.dataset_angle_unit ?? 'radians'}
                  mode={inference ? 'inference' : 'dataset'}
                />
                <div className="joint-readout">
                  {viewerValues.slice(0, 5).map((value, i) => (
                    <div key={i}>
                      <span>{viewerJointNames[i]?.replace('.pos', '') ?? `joint_${i + 1}`}</span>
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
                      onChange={(event) => setSelectedCameraKey(event.target.value)}
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
            inferenceRange={chunkRange}
            onFrame={(value) => {
              setFrameIndex(value)
              setInference(null)
            }}
            onPlaying={setPlaying}
            onSpeed={setSpeed}
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
          onInfer={runInference}
          onClearInference={() => {
            setInference(null)
            setInferencePlaying(false)
          }}
          onInferenceStep={setInferenceStep}
          onInferencePlaying={setInferencePlaying}
        />
      </main>
    </div>
  )
}
