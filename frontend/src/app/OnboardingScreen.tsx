import { CircleAlert } from 'lucide-react'

import { WorkspaceHeader } from '../features/evaluation/components/WorkspaceHeader'
import { ArtifactForm } from '../features/setup/ArtifactForm'
import type { SessionCreate } from '../shared/api/types'

interface Props {
  configuration: SessionCreate
  loading: boolean
  error: string | null
  onLoad: (payload: SessionCreate) => void
}

export function OnboardingScreen({ configuration, loading, error, onLoad }: Props) {
  return (
    <div className="workspace">
      <WorkspaceHeader session={null} />
      <main className="onboarding-main">
        <section className="onboarding">
          <div className="eyebrow">
            <span /> LEROBOT POLICY INSPECTION
          </div>
          <h1>LeRobot Lens</h1>
          <h2>
            See how your <em>policy responds.</em>
          </h2>
          <p>Inspect policy action chunks from any recorded LeRobot observation.</p>
          <div className="onboarding-form-shell">
            <ArtifactForm
              key="unconfigured"
              initialValue={configuration}
              loading={loading}
              error={error}
              showDemo
              variant="onboarding"
              onLoad={onLoad}
            />
            <p className="onboarding-artifact-note">
              Artifacts stay on your machine. Hub downloads use the local Hugging Face cache.
            </p>
          </div>
          <div className="scope-note">
            <CircleAlert size={18} />
            <p>
              <strong>Offline policy probe — not a simulator.</strong>
              <span>
                Predicted motion does not evaluate grasp success, contacts, dynamics, or closed-loop
                task completion.
              </span>
            </p>
          </div>
          <p className="onboarding-hint">
            Use a training episode to check memorization, or an unseen episode for a quick
            qualitative policy probe.
          </p>
        </section>
      </main>
    </div>
  )
}
