import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'

import type { LoadingState } from '../../app/useWorkspaceSession'
import styles from './LoadingProgress.module.css'

interface Props {
  loading: LoadingState
  onCancel: () => void
}

type StepStatus = 'done' | 'active' | 'pending'

function stepStatuses(message: string, hasPolicy: boolean): [string, StepStatus][] {
  const policyStarted = /policy/i.test(message)
  const steps: [string, StepStatus][] = [
    ['Dataset and robot model', policyStarted ? 'done' : 'active'],
  ]
  if (hasPolicy) steps.push(['Policy weights', policyStarted ? 'active' : 'pending'])
  return steps
}

export function LoadingProgress({ loading, onCancel }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsed = Math.max(0, Math.floor((now - loading.startedAt) / 1000))

  return (
    <div className={styles.progress} role="status" aria-live="polite">
      <div className={styles.header}>
        <strong>Opening session</strong>
        <span className="mono">{elapsed}s</span>
      </div>
      <div className={styles.bar} aria-hidden="true">
        <i />
      </div>
      <ol className={styles.steps}>
        {stepStatuses(loading.message, loading.hasPolicy).map(([label, status]) => (
          <li key={label} data-status={status}>
            <span className={styles.stepIcon}>
              {status === 'done' && <Check size={13} />}
              {status === 'active' && <LoaderCircle className="spin" size={13} />}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <p className={styles.message}>{loading.message}</p>
      {elapsed >= 8 && (
        <p className={styles.hint}>
          First loads from the Hub download weights into the local cache and can take a while.
        </p>
      )}
      <button type="button" className="btn btn-sm" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
