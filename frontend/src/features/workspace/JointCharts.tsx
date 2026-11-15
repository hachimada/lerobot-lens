import { useMemo } from 'react'

import { formatSigned, formatValue, jointLabel } from '../../shared/lib/format'
import { CHART_HEIGHT, CHART_WIDTH, chunkSpan, extent, frameX, linePath } from './chart'
import type { ProbeView } from './probes'
import { useScrub } from './useScrub'
import styles from './JointCharts.module.css'

interface Props {
  actionNames: string[]
  recorded: number[][] | null
  probes: ProbeView[]
  focus: ProbeView | null
  /** The focused chunk's step on the stage, whose values the columns compare; null for none. */
  focusStep: number | null
  frame: number
  frameCount: number
  onSeek: (frame: number) => void
}

interface JointSeries {
  index: number
  name: string
  recorded: number[]
  domain: [number, number]
  /** SVG paths, built once per data change rather than on every playback tick. */
  recordedPath: string
  probePaths: { id: string; d: string }[]
}

/**
 * One small chart per joint with its own vertical scale, all sharing the
 * episode's time axis, so joints with very different ranges stay readable.
 */
export function JointCharts({
  actionNames,
  recorded,
  probes,
  focus,
  focusStep,
  frame,
  frameCount,
  onSeek,
}: Props) {
  const scrub = useScrub(frameCount, onSeek)

  const series = useMemo<JointSeries[]>(() => {
    if (!recorded) return []
    const dimensions = Math.max(actionNames.length, recorded[0]?.length ?? 0)
    return Array.from({ length: dimensions }, (_, index) => {
      const values = recorded.map((action) => action[index])
      const predicted = probes.map((probe) =>
        probe.result.predicted_actions.map((action) => action[index]),
      )
      const domain = extent([...values, ...predicted.flat()])
      return {
        index,
        name: jointLabel(actionNames[index], index),
        recorded: values,
        domain,
        recordedPath: linePath(values, 0, frameCount, domain),
        probePaths: probes.map((probe, probeIndex) => ({
          id: probe.id,
          d: linePath(predicted[probeIndex], probe.startFrame, frameCount, domain),
        })),
      }
    })
  }, [actionNames, frameCount, probes, recorded])

  if (!recorded) {
    return <div className={styles.placeholder}>Loading recorded actions…</div>
  }
  if (series.length === 0) {
    return <div className={styles.placeholder}>This episode has no recorded actions.</div>
  }

  const playheadX = frameX(frame, frameCount)
  const focusSpan = focus && chunkSpan(focus, frameCount, CHART_WIDTH, 2)
  const predictedAction =
    focusStep === null ? undefined : focus?.result.predicted_actions[focusStep]
  const truthAction = focusStep === null ? undefined : focus?.result.ground_truth_actions[focusStep]

  return (
    <div className={styles.charts}>
      <div className={styles.header}>
        <div className={styles.columns}>
          <span>Joint</span>
          <span>Recorded</span>
          <span>Predicted</span>
          <span title="Predicted minus recorded action at this frame">Difference</span>
        </div>
        <div className={styles.legends}>
          <span>
            <i className={styles.recordedSwatch} /> Recorded action
          </span>
          <span>
            <i className={styles.predictedSwatch} /> Predicted chunks
          </span>
          <span className={styles.note}>Own scale per joint · click to seek</span>
        </div>
      </div>
      <ul className={styles.rows}>
        {series.map((joint) => {
          // Every column describes the frame under the playhead; while the stage shows the
          // recording there is no prediction, so Predicted and Difference stay empty.
          const predictedValue = predictedAction?.[joint.index]
          const truthValue = truthAction?.[joint.index]
          const difference =
            predictedValue !== undefined && truthValue !== undefined
              ? predictedValue - truthValue
              : undefined
          return (
            <li className={styles.row} key={joint.index}>
              <div className={styles.label}>
                <strong title={actionNames[joint.index]}>{joint.name}</strong>
                <span className="mono">{formatValue(joint.recorded[frame])}</span>
                <span className={`mono ${styles.predicted}`}>{formatValue(predictedValue)}</span>
                <span className="mono">{formatSigned(difference)}</span>
              </div>
              <div className={styles.plot} {...scrub}>
                <svg
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`${joint.name}: recorded actions and predicted chunks`}
                >
                  {focusSpan && (
                    <rect
                      className={styles.window}
                      x={focusSpan.x}
                      width={focusSpan.width}
                      y={0}
                      height={CHART_HEIGHT}
                    />
                  )}
                  <path
                    className={styles.recorded}
                    d={joint.recordedPath}
                    vectorEffect="non-scaling-stroke"
                  />
                  {joint.probePaths.map(({ id, d }) => (
                    <path
                      key={id}
                      className={id === focus?.id ? styles.focusLine : styles.probeLine}
                      d={d}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  <line
                    className={styles.playhead}
                    x1={playheadX}
                    x2={playheadX}
                    y1={0}
                    y2={CHART_HEIGHT}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <span className={styles.scale}>
                  <span>{formatValue(joint.domain[1], 1)}</span>
                  <span>{formatValue(joint.domain[0], 1)}</span>
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
