import type { RecentSession } from '../../app/useRecentSessions'
import type { LoadingState } from '../../app/useWorkspaceSession'
import type { SessionCreate } from '../../shared/api/types'
import { LoadingProgress } from './LoadingProgress'
import { RecentSessions } from './RecentSessions'
import { SessionForm } from './SessionForm'

export interface SessionPanelProps {
  configuration: SessionCreate
  recents: RecentSession[]
  loading: LoadingState | null
  error: string | null
  onSubmit: (payload: SessionCreate) => void
  onCancelLoading: () => void
  onForgetRecent: (config: SessionCreate) => void
}

interface Props extends SessionPanelProps {
  submitLabel: string
  onDemo?: () => void
}

/** Opening a session: the form, its error, then load progress or recent sessions. */
export function SessionPanel({
  configuration,
  recents,
  loading,
  error,
  submitLabel,
  onSubmit,
  onDemo,
  onCancelLoading,
  onForgetRecent,
}: Props) {
  return (
    <>
      <SessionForm
        initialValue={configuration}
        recents={recents}
        busy={!!loading}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        onDemo={onDemo}
      />
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <LoadingProgress loading={loading} onCancel={onCancelLoading} />
      ) : (
        <RecentSessions recents={recents} onOpen={onSubmit} onForget={onForgetRecent} />
      )}
    </>
  )
}
