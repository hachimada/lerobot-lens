import { timecode } from '../../shared/lib/format'
import { framePercent as percent } from './chart'
import { useScrub } from './useScrub'
import styles from './RecordingTimeline.module.css'

interface Props {
  frame: number
  frameCount: number
  fps: number
  onSeek: (frame: number) => void
}

/** The recorded episode as a scrubbable track; probe results have their own track. */
export function RecordingTimeline({ frame, frameCount, fps, onSeek }: Props) {
  const scrub = useScrub(frameCount, onSeek)
  const lastFrame = Math.max(0, frameCount - 1)

  return (
    <div
      className={styles.track}
      role="slider"
      tabIndex={0}
      aria-label="Recording timeline"
      aria-valuemin={0}
      aria-valuemax={lastFrame}
      aria-valuenow={frame}
      aria-valuetext={`Frame ${frame}, ${timecode(frame, fps)}`}
      {...scrub}
    >
      <div className={styles.rail} />
      <div className={styles.played} style={{ width: `${percent(frame, frameCount)}%` }} />
      <div className={styles.playhead} style={{ left: `${percent(frame, frameCount)}%` }} />
    </div>
  )
}
