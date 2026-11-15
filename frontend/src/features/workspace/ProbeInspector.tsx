import { memo } from 'react'
import type { ReactNode } from 'react'
import { Activity, ScanLine, Sparkles } from 'lucide-react'

import { formatValue, jointLabel } from '../../shared/lib/format'
import { frameRange } from './labels'
import type { ProbeView } from './probes'
import { ERROR_LEVEL_LABEL } from './probes'
import styles from './ProbeInspector.module.css'

interface Props {
  hasPolicy: boolean
  policyLabel: ReactNode
  device: string
  focus: ProbeView | null
  probes: ProbeView[]
  actionNames: string[]
  onSelect: (probe: ProbeView) => void
}

/**
 * Details of probe results; every action on them lives in the Probes panel.
 * Memoized, since its props hold still during playback.
 */
export const ProbeInspector = memo(function ProbeInspector({
  hasPolicy,
  policyLabel,
  device,
  focus,
  probes,
  actionNames,
  onSelect,
}: Props) {
  return (
    <aside className={styles.inspector} aria-label="Probe details">
      <div className={styles.header}>
        <div>
          <h2>Probe details</h2>
          <p>{hasPolicy ? policyLabel : 'No policy loaded'}</p>
        </div>
        {hasPolicy && <span className={`${styles.device} mono`}>{device.toUpperCase()}</span>}
      </div>

      {!hasPolicy ? (
        <div className={styles.empty}>
          <Activity size={22} />
          <strong>Browse-only session</strong>
          <p>Add a policy checkpoint to compare its predicted actions with the recording.</p>
        </div>
      ) : focus ? (
        <FocusCard probe={focus} actionNames={actionNames} />
      ) : (
        <div className={styles.empty}>
          <Sparkles size={22} />
          <strong>No probe selected</strong>
          <p>
            Probe the whole episode, or a single frame, then click a chunk on the probe track or in
            the list below to see its details.
          </p>
        </div>
      )}

      {hasPolicy && (
        <section className={styles.section} aria-labelledby="probe-list-title">
          <h3 id="probe-list-title">
            Probes in this episode <span className="count-pill">{probes.length}</span>
          </h3>
          {probes.length === 0 ? (
            <p className={styles.muted}>Probes appear here and on the probe track.</p>
          ) : (
            <ul className={styles.list}>
              {probes.map((probe) => (
                <li key={probe.id}>
                  <button
                    type="button"
                    className={styles.listItem}
                    aria-pressed={probe.id === focus?.id}
                    onClick={() => onSelect(probe)}
                  >
                    <i className={`level-dot level-${probe.metrics.level}`} />
                    <span className="mono">{frameRange(probe)}</span>
                    <span className={styles.listError}>
                      MAE{' '}
                      <strong className="mono">
                        {formatValue(probe.metrics.meanAbsoluteError)}
                      </strong>
                    </span>
                    {probe.source === 'scan' && <ScanLine size={12} aria-label="From scan" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className={styles.footnote}>
        Recorded actions are a reference, not ground truth: several actions can be valid for the
        same observation.
      </p>
    </aside>
  )
})

function FocusCard({ probe, actionNames }: { probe: ProbeView; actionNames: string[] }) {
  const { metrics } = probe
  const largest = Math.max(...metrics.jointErrors, 1e-9)
  return (
    <section className={`${styles.focus} level-${metrics.level}`} aria-label="Selected probe">
      <div className={styles.focusHeader}>
        <span className="mono">Frames {frameRange(probe)}</span>
        <span className={styles.levelChip}>{ERROR_LEVEL_LABEL[metrics.level]}</span>
      </div>
      <div className={styles.metric}>
        <strong className="mono">{formatValue(metrics.meanAbsoluteError)}</strong>
        <span>
          mean abs. error over {probe.steps} steps
          <em>{(metrics.normalizedError * 100).toFixed(1)}% of joint range</em>
        </span>
      </div>
      <ul className={styles.jointErrors} aria-label="Error by joint">
        {metrics.jointErrors.map((error, index) => (
          <li key={index}>
            <span title={actionNames[index]}>{jointLabel(actionNames[index], index)}</span>
            <span className={styles.errorBar}>
              <i style={{ width: `${(error / largest) * 100}%` }} />
            </span>
            <span className="mono">{formatValue(error)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
