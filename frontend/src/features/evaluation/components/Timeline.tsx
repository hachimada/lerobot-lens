import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'

import { timestamp } from '../timeline'
import styles from './Timeline.module.css'

interface Props {
  frame: number
  length: number
  fps: number
  playing: boolean
  speed: number
  inferenceRange?: [number, number]
  onFrame: (frame: number) => void
  onRestart: () => void
  onPreviousFrame: () => void
  onNextFrame: () => void
  onPlaying: (playing: boolean) => void
  onSpeed: (speed: number) => void
}

export function Timeline(props: Props) {
  const {
    frame,
    length,
    fps,
    playing,
    speed,
    inferenceRange,
    onFrame,
    onRestart,
    onPreviousFrame,
    onNextFrame,
    onPlaying,
    onSpeed,
  } = props
  const progress = length > 1 ? (frame / (length - 1)) * 100 : 0
  const chunkLeft = inferenceRange ? (inferenceRange[0] / Math.max(1, length - 1)) * 100 : 0
  const chunkWidth = inferenceRange
    ? ((inferenceRange[1] - inferenceRange[0]) / Math.max(1, length - 1)) * 100
    : 0

  return (
    <section className={`${styles.transport} panel`}>
      <div className={styles.timelineWrap}>
        <input
          aria-label="Episode timeline"
          className={styles.timeline}
          type="range"
          min={0}
          max={Math.max(0, length - 1)}
          value={frame}
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          onChange={(event) => onFrame(Number(event.target.value))}
        />
        {inferenceRange && (
          <div
            className={styles.chunkRange}
            style={{ left: `${chunkLeft}%`, width: `${chunkWidth}%` }}
          >
            <span>action chunk</span>
          </div>
        )}
      </div>
      <div className={styles.transportRow}>
        <div className={styles.timecode}>
          <strong>{timestamp(frame, fps)}</strong>
          <span>/ {timestamp(length - 1, fps)}</span>
        </div>
        <div className={styles.playbackButtons}>
          <button className={styles.iconButton} aria-label="Restart" onClick={onRestart}>
            <RotateCcw size={16} />
          </button>
          <button
            className={styles.iconButton}
            aria-label="Previous frame"
            onClick={onPreviousFrame}
          >
            <SkipBack size={17} />
          </button>
          <button
            className={styles.playButton}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => onPlaying(!playing)}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <button className={styles.iconButton} aria-label="Next frame" onClick={onNextFrame}>
            <SkipForward size={17} />
          </button>
        </div>
        <div className={styles.speedControl}>
          {[0.5, 1, 2].map((value) => (
            <button
              key={value}
              className={speed === value ? styles.active : undefined}
              onClick={() => onSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
