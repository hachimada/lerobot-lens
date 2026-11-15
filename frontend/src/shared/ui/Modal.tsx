import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

import styles from './Modal.module.css'

interface Props {
  title: string
  description?: string
  onClose: () => void
  dismissible?: boolean
  width?: number
  children: ReactNode
}

const FOCUSABLE = 'input, select, textarea, button:not([aria-label="Close dialog"]), [href]'

export function Modal({
  title,
  description,
  onClose,
  dismissible = true,
  width = 520,
  children,
}: Props) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    if (!dismissible) return
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [dismissible, onClose])

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth: width }}
      >
        <div className={styles.header}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {dismissible && (
            <button type="button" className="icon-btn" aria-label="Close dialog" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
