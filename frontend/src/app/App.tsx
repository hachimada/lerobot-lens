import { useCallback, useState } from 'react'

import { SessionDialog } from '../features/setup/SessionDialog'
import type { SessionCreate } from '../shared/api/types'
import { SetupScreen } from './SetupScreen'
import { useRecentSessions } from './useRecentSessions'
import { useTheme } from './useTheme'
import { DEMO_CONFIGURATION, useWorkspaceSession } from './useWorkspaceSession'
import { Workspace } from './Workspace'

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const { recents, remember, forget } = useRecentSessions()
  const {
    session,
    episodes,
    configuration,
    loading,
    error,
    loadSession,
    cancelLoading,
    closeSession,
    clearError,
  } = useWorkspaceSession()
  const [dialogOpen, setDialogOpen] = useState(false)

  const open = useCallback(
    async (payload: SessionCreate) => {
      if (await loadSession(payload)) {
        remember(payload)
        setDialogOpen(false)
      }
    },
    [loadSession, remember],
  )

  if (!session) {
    return (
      <SetupScreen
        configuration={configuration}
        recents={recents}
        loading={loading}
        error={error}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpen={(payload) => void open(payload)}
        onDemo={() => void open(DEMO_CONFIGURATION)}
        onCancelLoading={cancelLoading}
        onForgetRecent={forget}
      />
    )
  }

  return (
    <>
      <Workspace
        key={session.id}
        session={session}
        episodes={episodes}
        theme={theme}
        shortcutsEnabled={!dialogOpen}
        onToggleTheme={toggleTheme}
        onHome={closeSession}
        onEditSession={() => {
          clearError()
          setDialogOpen(true)
        }}
      />
      {dialogOpen && (
        <SessionDialog
          configuration={configuration}
          recents={recents}
          loading={loading}
          error={error}
          onSubmit={(payload) => void open(payload)}
          onCancelLoading={cancelLoading}
          onForgetRecent={forget}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  )
}
