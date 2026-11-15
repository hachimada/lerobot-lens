import { Clock3, Database, Sparkles, X } from 'lucide-react'

import type { RecentSession } from '../../app/useRecentSessions'
import { recentSessionKey } from '../../app/useRecentSessions'
import type { SessionCreate } from '../../shared/api/types'
import { displayName, relativeTime } from '../../shared/lib/format'
import { ArtifactLabel } from '../../shared/ui/ArtifactLabel'
import styles from './RecentSessions.module.css'

interface Props {
  recents: RecentSession[]
  disabled?: boolean
  onOpen: (config: SessionCreate) => void
  onForget: (config: SessionCreate) => void
}

export function RecentSessions({ recents, disabled = false, onOpen, onForget }: Props) {
  if (recents.length === 0) return null
  return (
    <section className={styles.recents} aria-labelledby="recent-sessions-title">
      <h2 id="recent-sessions-title">
        <Clock3 size={14} /> Recent
      </h2>
      <ul>
        {recents.map((recent) => {
          const { config } = recent
          return (
            <li key={recentSessionKey(config)}>
              <button
                type="button"
                className={styles.open}
                disabled={disabled}
                title={[config.dataset, config.policy].filter(Boolean).join('\n')}
                onClick={() => onOpen(config)}
              >
                <span className={styles.dataset}>
                  <Database size={13} aria-hidden="true" />
                  {displayName(config.dataset)}
                </span>
                <span className={styles.policy}>
                  <Sparkles size={13} aria-hidden="true" />
                  {config.policy ? <ArtifactLabel reference={config.policy} /> : 'Dataset only'}
                </span>
                <span className={styles.time}>{relativeTime(recent.openedAt)}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${displayName(config.dataset)} from recent sessions`}
                title="Remove from recent"
                disabled={disabled}
                onClick={() => onForget(config)}
              >
                <X size={14} />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
