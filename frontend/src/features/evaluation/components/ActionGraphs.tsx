import { useEffect, useMemo, useState } from 'react'

import type { EpisodeActions, InferenceResult } from '../../../shared/api/types'
import { linePath } from '../actionGraph'
import styles from './ActionGraphs.module.css'

interface Props {
  episodeActions: EpisodeActions | null
  inference: InferenceResult | null
  currentFrame: number
}

const COLORS = ['#dd5748', '#527f9d', '#879b38', '#9a61a6', '#cf873c', '#477f76', '#986b52']
const WIDTH = 1120
const HEIGHT = 310
const PAD = { left: 58, right: 22, top: 24, bottom: 34 }

export function ActionGraphs({ episodeActions, inference, currentFrame }: Props) {
  const [disabledJoints, setDisabledJoints] = useState<Set<number>>(() => new Set())
  const jointSignature = episodeActions?.action_names.join('\u0000') ?? ''

  useEffect(() => {
    setDisabledJoints(new Set())
  }, [episodeActions?.episode, jointSignature])

  const dimensions = episodeActions
    ? Math.max(episodeActions.action_names.length, episodeActions.actions[0]?.length ?? 0)
    : 0

  const series = useMemo(() => {
    if (!episodeActions) return []
    return Array.from({ length: dimensions }, (_, jointIndex) => ({
      index: jointIndex,
      name: episodeActions.action_names[jointIndex] ?? `action_${jointIndex + 1}`,
      color: COLORS[jointIndex % COLORS.length],
      dataset: episodeActions.actions.map((action) => action[jointIndex] ?? 0),
      predicted: inference?.predicted_actions.map((action) => action[jointIndex] ?? 0) ?? [],
    }))
  }, [dimensions, episodeActions, inference])

  if (!episodeActions || episodeActions.actions.length === 0) {
    return <div className={styles.graphLoading}>Loading episode actions…</div>
  }

  const visibleSeries = series.filter(({ index }) => !disabledJoints.has(index))
  const values = visibleSeries.flatMap(({ dataset, predicted }) => [...dataset, ...predicted])
  let min = values.length > 0 ? Math.min(...values) : 0
  let max = values.length > 0 ? Math.max(...values) : 1
  const padding = Math.max((max - min) * 0.08, 0.02)
  min -= padding
  max += padding

  const totalFrames = episodeActions.actions.length
  const duration = (totalFrames - 1) / episodeActions.fps
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const frameDenominator = Math.max(1, totalFrames - 1)
  const cursorX = PAD.left + (currentFrame / frameDenominator) * plotWidth
  const predictionStart = inference?.start_frame ?? 0
  const predictionIndex = inference
    ? Math.max(0, Math.min(inference.predicted_actions.length - 1, currentFrame - predictionStart))
    : -1

  const toggleJoint = (jointIndex: number) => {
    setDisabledJoints((current) => {
      const next = new Set(current)
      if (next.has(jointIndex)) next.delete(jointIndex)
      else next.add(jointIndex)
      return next
    })
  }

  return (
    <div className={styles.actionGraphCombined}>
      <div className={styles.actionGraph}>
        {visibleSeries.length === 0 ? (
          <div className={styles.graphEmpty}>
            <strong>No joints selected</strong>
            <span>Turn on one or more joints to display their action trajectories.</span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label="Selected joint actions: dataset over the full episode and policy prediction over the action chunk"
          >
            <title>Selected joint action comparison</title>
            <desc>
              Dataset actions are dashed across the complete episode. Policy outputs are solid
              during the action chunk. Each joint uses the color shown in its visibility control.
            </desc>
            {[0, 0.25, 0.5, 0.75, 1].map((position) => {
              const y = PAD.top + position * plotHeight
              const value = max - position * (max - min)
              return (
                <g key={position}>
                  <line
                    className={styles.graphGridline}
                    x1={PAD.left}
                    x2={WIDTH - PAD.right}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className={styles.graphAxisLabel}
                    x={PAD.left - 9}
                    y={y + 4}
                    textAnchor="end"
                  >
                    {value.toFixed(1)}
                  </text>
                </g>
              )
            })}
            <text className={styles.graphAxisLabel} x={PAD.left} y={HEIGHT - 9}>
              0s
            </text>
            <text
              className={styles.graphAxisLabel}
              x={WIDTH - PAD.right}
              y={HEIGHT - 9}
              textAnchor="end"
            >
              {duration.toFixed(1)}s
            </text>
            {inference && (
              <rect
                className={styles.chunkWindow}
                x={PAD.left + (predictionStart / frameDenominator) * plotWidth}
                y={PAD.top}
                width={(inference.chunk_size / frameDenominator) * plotWidth}
                height={plotHeight}
              />
            )}
            {visibleSeries.map(({ index, color, dataset }) => (
              <path
                className={styles.datasetActionLine}
                style={{ stroke: color }}
                d={linePath(dataset, 0, totalFrames, min, max)}
                key={`dataset-${index}`}
              />
            ))}
            {visibleSeries.map(
              ({ index, color, predicted }) =>
                predicted.length > 0 && (
                  <path
                    className={styles.predictedActionLine}
                    style={{ stroke: color }}
                    d={linePath(predicted, predictionStart, totalFrames, min, max)}
                    key={`prediction-${index}`}
                  />
                ),
            )}
            <line
              className={styles.frameCursor}
              x1={cursorX}
              x2={cursorX}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
          </svg>
        )}
      </div>

      <aside className={styles.jointToggles} aria-label="Joint visibility legend">
        <div className={styles.jointValueHeading}>
          <button type="button" onClick={() => setDisabledJoints(new Set())}>
            Show all
          </button>
          <strong>DATASET</strong>
          <strong>POLICY</strong>
          <em>VIEW</em>
        </div>
        <div className={styles.jointToggleList}>
          {series.map(({ index, name, color, dataset, predicted }) => {
            const enabled = !disabledJoints.has(index)
            const policyValue = predictionIndex >= 0 ? predicted[predictionIndex] : undefined
            return (
              <button
                className={enabled ? `${styles.jointToggle} ${styles.active}` : styles.jointToggle}
                type="button"
                aria-pressed={enabled}
                onClick={() => toggleJoint(index)}
                key={name}
              >
                <i style={{ background: color }} />
                <span>{name}</span>
                <strong>{dataset[currentFrame]?.toFixed(2) ?? '—'}</strong>
                <b>{policyValue?.toFixed(2) ?? '—'}</b>
                <em>{enabled ? 'ON' : 'OFF'}</em>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
