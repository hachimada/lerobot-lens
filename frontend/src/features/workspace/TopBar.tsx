import {
  Cpu,
  Database,
  Github,
  Keyboard,
  Moon,
  PanelLeft,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react'

import type { Theme } from '../../app/useTheme'
import type { SessionSummary } from '../../shared/api/types'
import { ArtifactLabel } from '../../shared/ui/ArtifactLabel'
import styles from './TopBar.module.css'

interface Props {
  session?: SessionSummary | null
  theme: Theme
  onToggleTheme: () => void
  onHome?: () => void
  onEditSession?: () => void
  onShowShortcuts?: () => void
  onToggleSidebar?: () => void
}

export function TopBar({
  session,
  theme,
  onToggleTheme,
  onHome,
  onEditSession,
  onShowShortcuts,
  onToggleSidebar,
}: Props) {
  return (
    <header className={styles.topBar}>
      <div className={styles.leading}>
        {onToggleSidebar && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle episode list"
            title="Toggle episode list"
            onClick={onToggleSidebar}
          >
            <PanelLeft size={17} />
          </button>
        )}
        <button
          type="button"
          className={styles.brand}
          onClick={onHome}
          disabled={!onHome}
          aria-label={onHome ? 'Close session and return to setup' : 'LeRobot Lens'}
          title={onHome ? 'Close session and return to setup' : undefined}
        >
          <span className={styles.mark} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.wordmark}>LeRobot Lens</span>
        </button>
      </div>

      {session && (
        <div className={styles.sessionSummary} aria-label="Current session">
          <span className={styles.chip}>
            <Database size={13} aria-hidden="true" />
            <ArtifactLabel reference={session.dataset} />
          </span>
          <span
            className={`${styles.chip} ${session.policy || session.demo ? '' : styles.chipMuted}`}
          >
            <Sparkles size={13} aria-hidden="true" />
            {session.demo ? (
              <span>Demo policy</span>
            ) : (
              <ArtifactLabel reference={session.policy} fallback="No policy" />
            )}
          </span>
          <span className={styles.chip} title="Inference device">
            <Cpu size={13} aria-hidden="true" />
            <span className="mono">{session.device.toUpperCase()}</span>
          </span>
          {session.demo && <span className={styles.demoBadge}>Demo</span>}
          {onEditSession && (
            <button type="button" className="btn btn-sm" onClick={onEditSession}>
              <SlidersHorizontal size={14} /> Change
            </button>
          )}
        </div>
      )}

      <div className={styles.trailing}>
        {onShowShortcuts && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={onShowShortcuts}
          >
            <Keyboard size={17} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <a
          className="icon-btn"
          href="https://github.com/hachimada/lerobot-lens"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LeRobot Lens on GitHub"
          title="GitHub"
        >
          <Github size={17} />
        </a>
      </div>
    </header>
  )
}
