import {
  Activity,
  BarChart3,
  CircleStop,
  FlaskConical,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react'

import type { FrameData, InferenceResult, SessionSummary } from '../../../shared/api/types'

interface Props {
  session: SessionSummary
  episodeIndex: number
  frameIndex: number
  frameData: FrameData
  inference: InferenceResult | null
  inferenceStep: number
  inferencePlaying: boolean
  inferring: boolean
  error: string | null
  onInfer: () => void
  onClearInference: () => void
  onInferenceStep: (step: number) => void
  onInferencePlaying: (playing: boolean) => void
}

export function AnalysisPanel(props: Props) {
  const {
    session,
    episodeIndex,
    frameIndex,
    frameData,
    inference,
    inferenceStep,
    inferencePlaying,
    inferring,
    error,
    onInfer,
    onClearInference,
    onInferenceStep,
    onInferencePlaying,
  } = props

  return (
    <aside className="analysis-panel">
      <div className="analysis-heading">
        <div>
          <span>
            <FlaskConical size={17} />
          </span>
          <p>
            <strong>Policy probe</strong>
            <small>Action chunk inference</small>
          </p>
        </div>
        {inference && (
          <button aria-label="Clear inference" onClick={onClearInference}>
            <X size={16} />
          </button>
        )}
      </div>
      <div className="observation-card">
        <div className="mini-heading">
          <span>OBSERVATION</span>
          <em>FRAME {frameIndex}</em>
        </div>
        <p>Run the loaded policy from the currently selected dataset observation.</p>
        <div className="obs-meta">
          <div>
            <small>Episode</small>
            <strong>#{String(episodeIndex).padStart(3, '0')}</strong>
          </div>
          <div>
            <small>Timestamp</small>
            <strong>{frameData.timestamp.toFixed(3)}s</strong>
          </div>
          <div>
            <small>State dim</small>
            <strong>{frameData.state.length}</strong>
          </div>
        </div>
        <button className="infer-button" disabled={inferring} onClick={onInfer}>
          {inferring ? (
            <>
              <LoaderCircle className="spin" size={17} /> Running policy…
            </>
          ) : (
            <>
              <Sparkles size={17} /> Infer action chunk
            </>
          )}
        </button>
      </div>

      {!inference ? (
        <div className="empty-analysis">
          <span>
            <Activity size={25} />
          </span>
          <strong>No inference yet</strong>
          <p>Choose any frame, then run the policy to inspect its predicted motion.</p>
        </div>
      ) : (
        <InferenceDetails
          session={session}
          inference={inference}
          step={inferenceStep}
          playing={inferencePlaying}
          onStep={onInferenceStep}
          onPlaying={onInferencePlaying}
        />
      )}

      {error && <div className="inline-error">{error}</div>}
      <div className="analysis-footer">
        <BarChart3 size={15} /> Evaluation stays local
      </div>
    </aside>
  )
}

interface InferenceDetailsProps {
  session: SessionSummary
  inference: InferenceResult
  step: number
  playing: boolean
  onStep: (step: number) => void
  onPlaying: (playing: boolean) => void
}

function InferenceDetails(props: InferenceDetailsProps) {
  const { session, inference, step, playing, onStep, onPlaying } = props
  return (
    <>
      <div className="result-status">
        <div>
          <i />
          <span>INFERENCE COMPLETE</span>
        </div>
        <strong>{inference.chunk_size} actions</strong>
      </div>
      <div className="chunk-player">
        <div className="mini-heading">
          <span>CHUNK REPLAY</span>
          <em>
            {step + 1} / {inference.chunk_size}
          </em>
        </div>
        <div className="chunk-track">
          <div style={{ width: `${((step + 1) / inference.chunk_size) * 100}%` }} />
        </div>
        <div className="chunk-controls">
          <button aria-label="Restart chunk" onClick={() => onStep(0)}>
            <RotateCcw size={15} />
          </button>
          <button className="chunk-play" onClick={() => onPlaying(!playing)}>
            {playing ? <CircleStop size={16} /> : <Play size={16} />} {playing ? 'Stop' : 'Replay'}
          </button>
        </div>
      </div>
      <div className="action-table">
        <div className="mini-heading">
          <span>PREDICTED ACTION</span>
          <em>STEP {step}</em>
        </div>
        {(inference.predicted_actions[step] ?? []).slice(0, 7).map((value, index) => {
          const truth = inference.ground_truth_actions[step]?.[index] ?? 0
          return (
            <div className="action-row" key={index}>
              <span>{session.joint_names[index] ?? `joint_${index + 1}`}</span>
              <strong>{value.toFixed(3)}</strong>
              <em className={Math.abs(value - truth) < 0.04 ? 'good' : ''}>
                {value - truth >= 0 ? '+' : ''}
                {(value - truth).toFixed(3)}
              </em>
            </div>
          )
        })}
      </div>
      <div className="legend">
        <span>
          <i className="prediction" /> prediction
        </span>
        <span>
          <i className="truth" /> dataset
        </span>
      </div>
    </>
  )
}
