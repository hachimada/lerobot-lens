import { Activity, Boxes, ScanLine, TriangleAlert } from 'lucide-react'

import { SessionPanel } from '../features/setup/SessionPanel'
import { TopBar } from '../features/workspace/TopBar'
import type { SessionCreate } from '../shared/api/types'
import type { RecentSession } from './useRecentSessions'
import type { Theme } from './useTheme'
import type { LoadingState } from './useWorkspaceSession'
import styles from './SetupScreen.module.css'

interface Props {
  configuration: SessionCreate
  recents: RecentSession[]
  loading: LoadingState | null
  error: string | null
  theme: Theme
  onToggleTheme: () => void
  onOpen: (payload: SessionCreate) => void
  onDemo: () => void
  onCancelLoading: () => void
  onForgetRecent: (config: SessionCreate) => void
}

const FEATURES = [
  {
    icon: ScanLine,
    title: 'Probe whole episodes',
    body: 'Run the policy chunk after chunk, with or without overlap, and see where its predictions drift from the demonstration.',
  },
  {
    icon: Activity,
    title: 'Check any single frame',
    body: 'Probe one recorded observation and compare its action chunk with what was recorded.',
  },
  {
    icon: Boxes,
    title: 'See it on the robot',
    body: 'Replay predicted motion on a URDF model next to the recorded pose and every camera.',
  },
]

export function SetupScreen({
  configuration,
  recents,
  loading,
  error,
  theme,
  onToggleTheme,
  onOpen,
  onDemo,
  onCancelLoading,
  onForgetRecent,
}: Props) {
  return (
    <div className={styles.screen}>
      <TopBar theme={theme} onToggleTheme={onToggleTheme} />
      <main className={styles.main}>
        <section className={styles.intro}>
          <p className={styles.eyebrow}>Offline policy inspection for LeRobot</p>
          <h1>
            See how your policy <em>responds</em> to recorded observations.
          </h1>
          <ul className={styles.features}>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title}>
                <span>
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.scope}>
            <TriangleAlert size={15} />
            <p>
              Not a simulator: probes are open-loop, so they cannot judge grasps, contacts, or task
              success. Use them to sanity-check a checkpoint before a robot or sim rollout.
            </p>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="setup-title">
          <div className={styles.cardHeader}>
            <h2 id="setup-title">Open a session</h2>
            <p>Everything runs locally. Hub artifacts go to your Hugging Face cache.</p>
          </div>
          <SessionPanel
            configuration={configuration}
            recents={recents}
            loading={loading}
            error={error}
            submitLabel="Open workspace"
            onSubmit={onOpen}
            onDemo={onDemo}
            onCancelLoading={onCancelLoading}
            onForgetRecent={onForgetRecent}
          />
        </section>
      </main>
    </div>
  )
}
