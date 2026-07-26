import type { ReactNode } from 'react'
import { Github } from 'lucide-react'

import type { SessionSummary } from '../../../shared/api/types'
import styles from './WorkspaceHeader.module.css'

interface Props {
  session: SessionSummary | null
  onClose?: () => void
  children?: ReactNode
}

export function WorkspaceHeader({ session, onClose, children }: Props) {
  const configured = session !== null

  return (
    <header className={styles.workspaceHeader}>
      <div className={styles.topbar}>
        <div
          className={
            configured ? `${styles.topbarMain} ${styles.hasConfiguration}` : styles.topbarMain
          }
        >
          <div className={styles.brandCluster}>
            <button
              type="button"
              className={`brand ${styles.brandButton}`}
              aria-label={configured ? 'Return to workspace setup' : 'LeRobot Lens'}
              title={configured ? 'Return to workspace setup' : 'LeRobot Lens'}
              onClick={onClose}
              disabled={!configured || !onClose}
            >
              <span className="brand-mark">
                <i />
                <i />
                <i />
              </span>
              <strong>LeRobot Lens</strong>
            </button>
            {!configured && (
              <a
                className={styles.onboardingGithubLink}
                href="https://github.com/hachimada/lerobot-lens"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open LeRobot Lens on GitHub"
                title="Open LeRobot Lens on GitHub"
              >
                <Github size={18} aria-hidden="true" />
              </a>
            )}
          </div>
          {children}
        </div>
      </div>
    </header>
  )
}
