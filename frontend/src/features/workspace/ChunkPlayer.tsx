import { ListVideo, Pause, Play, X } from 'lucide-react'

import { formatValue } from '../../shared/lib/format'
import { frameRange } from './labels'
import type { ProbeView } from './probes'
import { ERROR_LEVEL_LABEL } from './probes'
import styles from './ChunkPlayer.module.css'

interface Props {
  probe: ProbeView | null
  count: number
  /** Whether the stage shows this probe rather than the recording. */
  active: boolean
  step: number
  playing: boolean
  /** Whether the chunks are playing through the episode. */
  playingAll: boolean
  onTogglePlay: () => void
  onPlayAll: () => void
  onSeekStep: (step: number) => void
  onRemove: (id: string) => void
}

/**
 * The selected probe's own timeline, step by step, and playback of the chunks
 * through the episode (each frame from the latest observation; see chunkAt).
 */
export function ChunkPlayer({
  probe,
  count,
  active,
  step,
  playing,
  playingAll,
  onTogglePlay,
  onPlayAll,
  onSeekStep,
  onRemove,
}: Props) {
  if (count === 0) return null
  const playAll = (
    <button
      type="button"
      className={`btn btn-sm ${styles.playAll}`}
      aria-pressed={playingAll}
      title={
        playingAll
          ? 'Pause'
          : 'Play the chunks through the episode: at each frame, the chunk inferred from the latest observation'
      }
      onClick={onPlayAll}
    >
      {playingAll ? <Pause size={14} fill="currentColor" /> : <ListVideo size={14} />}
      Play all chunks
    </button>
  )

  if (!probe) {
    return (
      <div className={styles.player}>
        <div className={styles.header}>
          {playAll}
          <p className={styles.hint}>
            Or select a chunk above to compare its predicted actions with the recording.
          </p>
        </div>
      </div>
    )
  }

  const { steps } = probe
  return (
    <div
      className={`${styles.player} ${active ? styles.active : ''}`}
      role="group"
      aria-label="Chunk player"
    >
      <div className={styles.header}>
        {playAll}
        <span className={`${styles.summary} level-${probe.metrics.level}`}>
          <i className="level-dot" />
          <span className="mono">Probe {frameRange(probe)}</span>
          <span className={styles.level}>{ERROR_LEVEL_LABEL[probe.metrics.level]}</span>
          <span className={styles.mae}>
            MAE <strong className="mono">{formatValue(probe.metrics.meanAbsoluteError)}</strong>
          </span>
        </span>
        <span className={styles.actions}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Remove this probe (Delete)"
            onClick={() => onRemove(probe.id)}
          >
            <X size={13} /> Remove this probe
          </button>
        </span>
      </div>
      <div className={styles.timeline}>
        <button
          type="button"
          className={styles.play}
          aria-label={playing ? 'Pause chunk' : 'Play chunk'}
          title={playing ? 'Pause chunk' : 'Play chunk (R)'}
          onClick={onTogglePlay}
        >
          {playing ? (
            <Pause size={13} fill="currentColor" />
          ) : (
            <Play size={13} fill="currentColor" />
          )}
        </button>
        <span className={`${styles.step} mono`}>
          Step {step + 1} / {steps}
          <em> · frame {probe.startFrame + step}</em>
        </span>
        <input
          type="range"
          className={styles.slider}
          aria-label="Chunk step"
          min={0}
          max={steps - 1}
          value={step}
          onChange={(event) => onSeekStep(Number(event.target.value))}
        />
      </div>
    </div>
  )
}
