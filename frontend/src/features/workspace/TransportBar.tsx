import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { ReactNode } from 'react'

import { timecode } from '../../shared/lib/format'
import { withShortcut } from './shortcuts'
import styles from './TransportBar.module.css'

interface Props {
  frame: number
  frameCount: number
  fps: number
  playing: boolean
  speed: number
  onToggle: () => void
  onStep: (delta: number) => void
  onSpeed: (speed: number) => void
  /** The timeline, placed between the position readout and the speed control. */
  children?: ReactNode
}

const SPEEDS = [0.25, 0.5, 1, 2]

export function TransportBar({
  frame,
  frameCount,
  fps,
  playing,
  speed,
  onToggle,
  onStep,
  onSpeed,
  children,
}: Props) {
  const lastFrame = Math.max(0, frameCount - 1)
  return (
    <div className={styles.transport}>
      <div className={styles.controls}>
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous frame"
          title={withShortcut('Previous frame', 'previous-frame')}
          onClick={() => onStep(-1)}
        >
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          className={styles.play}
          aria-label={playing ? 'Pause' : 'Play'}
          title={withShortcut(playing ? 'Pause' : 'Play', 'toggle-play')}
          onClick={onToggle}
        >
          {playing ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next frame"
          title={withShortcut('Next frame', 'next-frame')}
          onClick={() => onStep(1)}
        >
          <SkipForward size={15} />
        </button>
      </div>

      <div className={styles.position} title={`${frameCount} frames at ${fps} fps`}>
        <span className="mono">
          {timecode(frame, fps)}
          <em> / {timecode(lastFrame, fps)}</em>
        </span>
        <span className={`${styles.frame} mono`}>
          Frame {frame} / {lastFrame}
        </span>
      </div>

      {children && <div className={styles.timeline}>{children}</div>}

      <div className={`segmented ${styles.speed}`} role="group" aria-label="Playback speed">
        {SPEEDS.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={speed === value}
            onClick={() => onSpeed(value)}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  )
}
