import { useMemo } from 'react'

import { formatValue } from '../../shared/lib/format'
import { chunkSpan, framePercent as percent } from './chart'
import { frameRange } from './labels'
import type { ProbeView } from './probes'
import { ERROR_LEVEL_LABEL, packLanes } from './probes'
import styles from './ProbeTrack.module.css'

interface Props {
  probes: ProbeView[]
  selectedId: string | null
  frameCount: number
  /** Where the recording is, as a reference for probing a single frame. */
  recordingFrame: number
  /** The frame of the chunk step on the stage, while a probe is shown. */
  stepFrame?: number
  onSelect: (probe: ProbeView) => void
}

/**
 * Probe results on the episode's time axis, apart from the recording timeline.
 * Overlapping chunks stack into rows so each one can be clicked.
 */
export function ProbeTrack({
  probes,
  selectedId,
  frameCount,
  recordingFrame,
  stepFrame,
  onSelect,
}: Props) {
  const packed = useMemo(() => packLanes(probes), [probes])
  // While a whole-episode probe starts, an empty lane holds the place of its chunks.
  const lanes = packed.length > 0 ? packed : [[]]

  return (
    <div
      className={styles.track}
      role="group"
      aria-label="Probe chunks"
      data-has-selection={selectedId ? 'true' : undefined}
    >
      {lanes.map((lane, index) => (
        <div className={styles.lane} key={index}>
          {lane.map((probe) => {
            const label = `Probe ${frameRange(probe)}, ${ERROR_LEVEL_LABEL[probe.metrics.level]}`
            const span = chunkSpan(probe, frameCount, 100, 0.6)
            return (
              <button
                type="button"
                key={probe.id}
                className={`${styles.segment} level-${probe.metrics.level}`}
                aria-pressed={probe.id === selectedId}
                aria-label={label}
                title={`${label} · MAE ${formatValue(probe.metrics.meanAbsoluteError)}`}
                style={{ left: `${span.x}%`, width: `${span.width}%` }}
                onClick={() => onSelect(probe)}
              >
                <span className="mono">{frameRange(probe)}</span>
              </button>
            )
          })}
        </div>
      ))}
      <div
        className={styles.recordingMarker}
        style={{ left: `${percent(recordingFrame, frameCount)}%` }}
        title={`Recording at frame ${recordingFrame}`}
      />
      {stepFrame !== undefined && (
        <div
          className={styles.stepCursor}
          style={{ left: `${percent(stepFrame, frameCount)}%` }}
          title="Chunk step on the stage"
        />
      )}
    </div>
  )
}
