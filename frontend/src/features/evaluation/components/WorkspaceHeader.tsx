import { Box, Database, Github, Settings2, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import type { SessionSummary } from '../../../shared/api/types'

interface Props {
  session: SessionSummary
  onClose: () => void
}

export function WorkspaceHeader({ session, onClose }: Props) {
  const robotLabel = session.has_urdf
    ? session.demo
      ? 'SO-101 · Bundled URDF'
      : 'Loaded URDF'
    : 'No URDF · Graph mode'

  return (
    <header className="topbar">
      <button className="brand brand-button" onClick={onClose}>
        <span className="brand-mark">
          <i />
          <i />
          <i />
        </span>
        <strong>LeRobot Lens</strong>
      </button>
      <div className="artifact-pills">
        <Artifact label="DATASET" value={session.dataset} icon={<Database size={14} />} />
        <Artifact
          label="POLICY"
          value={session.policy ?? 'Not loaded'}
          icon={<Sparkles size={14} />}
        />
        <Artifact label="ROBOT" value={robotLabel} icon={<Box size={14} />} />
      </div>
      <div className="top-actions">
        <span className="status-pill">
          <i /> READY · {session.device.toUpperCase()}
        </span>
        <a
          aria-label="Open LeRobot on GitHub"
          href="https://github.com/huggingface/lerobot"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} />
        </a>
        <button aria-label="Settings">
          <Settings2 size={17} />
        </button>
      </div>
    </header>
  )
}

interface ArtifactProps {
  label: string
  value: string
  icon: ReactNode
}

function Artifact({ label, value, icon }: ArtifactProps) {
  return (
    <div>
      <span>{icon}</span>
      <p>
        <small>{label}</small>
        <strong>{value}</strong>
      </p>
    </div>
  )
}
