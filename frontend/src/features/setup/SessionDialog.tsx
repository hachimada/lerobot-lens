import { Modal } from '../../shared/ui/Modal'
import type { SessionPanelProps } from './SessionPanel'
import { SessionPanel } from './SessionPanel'

interface Props extends SessionPanelProps {
  onClose: () => void
}

/** Switch dataset, checkpoint, or robot without leaving the workspace. */
export function SessionDialog({ onClose, ...panel }: Props) {
  return (
    <Modal
      title="Change session"
      description="The current workspace stays open until the new session is ready."
      dismissible={!panel.loading}
      onClose={onClose}
    >
      <SessionPanel {...panel} submitLabel="Open session" />
    </Modal>
  )
}
