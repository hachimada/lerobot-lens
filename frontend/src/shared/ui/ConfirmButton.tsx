import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import styles from './ConfirmButton.module.css'

interface Props {
  children: ReactNode
  /** Label of the second, confirming click. */
  confirmLabel: string
  onConfirm: () => void
  className?: string
  disabled?: boolean
}

const REVERT_AFTER_MS = 4000

/** A destructive action that asks for a second click before it runs. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className, disabled }: Props) {
  const [armed, setArmed] = useState(false)
  // A button that becomes unavailable while armed backs out of the confirmation.
  if (disabled && armed) setArmed(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), REVERT_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [armed])

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {children}
      </button>
    )
  }
  return (
    <span className={styles.group}>
      <button
        type="button"
        className={`btn btn-sm ${styles.confirm}`}
        autoFocus
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  )
}
