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
import styles from './AnalysisPanel.module.css'

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
    <aside className={styles.analysisPanel}>
      <div className={styles.analysisHeading}>
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
      <div className={styles.observationCard}>
        <div className={styles.miniHeading}>
          <span>OBSERVATION</span>
          <em>FRAME {frameIndex}</em>
        </div>
        <p>Run the loaded policy from the currently selected dataset observation.</p>
        <div className={styles.obsMeta}>
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
        <button className={styles.inferButton} disabled={inferring} onClick={onInfer}>
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
        <div className={styles.emptyAnalysis}>
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

      {error && <div className={`${styles.inlineError} inline-error`}>{error}</div>}
      <div className={styles.analysisFooter}>
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
      <div className={styles.resultStatus}>
        <div>
          <i />
          <span>INFERENCE COMPLETE</span>
        </div>
        <strong>{inference.chunk_size} actions</strong>
      </div>
      <div className={styles.chunkPlayer}>
        <div className={styles.miniHeading}>
          <span>CHUNK REPLAY</span>
          <em>
            {step + 1} / {inference.chunk_size}
          </em>
        </div>
        <div className={styles.chunkTrack}>
          <div style={{ width: `${((step + 1) / inference.chunk_size) * 100}%` }} />
        </div>
        <div className={styles.chunkControls}>
          <button aria-label="Restart chunk" onClick={() => onStep(0)}>
            <RotateCcw size={15} />
          </button>
          <button className={styles.chunkPlay} onClick={() => onPlaying(!playing)}>
            {playing ? <CircleStop size={16} /> : <Play size={16} />} {playing ? 'Stop' : 'Replay'}
          </button>
        </div>
      </div>
      <div className={styles.actionTable}>
        <div className={styles.miniHeading}>
          <span>PREDICTED ACTION</span>
          <em>STEP {step}</em>
        </div>
        {(inference.predicted_actions[step] ?? []).slice(0, 7).map((value, index) => {
          const truth = inference.ground_truth_actions[step]?.[index] ?? 0
          return (
            <div className={styles.actionRow} key={index}>
              <span>{session.joint_names[index] ?? `joint_${index + 1}`}</span>
              <strong>{value.toFixed(3)}</strong>
              <em className={Math.abs(value - truth) < 0.04 ? styles.good : undefined}>
                {value - truth >= 0 ? '+' : ''}
                {(value - truth).toFixed(3)}
              </em>
            </div>
          )
        })}
      </div>
      <div className={styles.legend}>
        <span>
          <i className={styles.prediction} /> prediction
        </span>
        <span>
          <i className={styles.truth} /> dataset
        </span>
      </div>
    </>
  )
}
