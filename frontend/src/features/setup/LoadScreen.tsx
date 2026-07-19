import { useEffect, useState } from 'react'
import { ArrowRight, CircleAlert, CircleHelp, Cpu, Github, LoaderCircle } from 'lucide-react'
import { api } from '../../shared/api/client'
import type { BundledRobot, SessionCreate } from '../../shared/api/types'

interface Props {
  loading: boolean
  error: string | null
  onLoad: (payload: SessionCreate) => void
}

const DATASET_ANGLE_UNIT_HELP =
  "URDF joints use radians. To reproduce the dataset's motion correctly in the URDF viewer, select the angle unit used by the dataset's joint values. Choose Degrees for values such as 90, or Radians for values such as 1.57."

function isJointMapping(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([sourceName, targetName]) => sourceName.length > 0 && typeof targetName === 'string',
    )
  )
}

export function LoadScreen({ loading, error, onLoad }: Props) {
  const [dataset, setDataset] = useState('')
  const [policy, setPolicy] = useState('')
  const [urdf, setUrdf] = useState('')
  const [bundledRobots, setBundledRobots] = useState<BundledRobot[]>([])
  const [selectedRobot, setSelectedRobot] = useState('')
  const [device, setDevice] = useState('auto')
  const [mapping, setMapping] = useState('')
  const [angleUnit, setAngleUnit] = useState<'' | 'degrees' | 'radians'>('')
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getRobots()
      .then((robots) => {
        if (active) setBundledRobots(robots)
      })
      .catch(() => {
        if (active) setBundledRobots([])
      })
    return () => {
      active = false
    }
  }, [])

  const updateUrdf = (value: string) => {
    setUrdf(value)
    setSelectedRobot('')
  }

  const selectRobot = (value: string) => {
    setSelectedRobot(value)
    if (value) setUrdf('')
  }

  const submit = (demo: boolean) => {
    setFormError(null)
    if (demo) {
      onLoad({
        dataset: 'demo',
        policy: null,
        urdf: null,
        device,
        joint_mapping: {},
        dataset_angle_unit: null,
        demo: true,
      })
      return
    }
    if (!dataset.trim()) {
      setFormError('Dataset path or dataset ID is required.')
      return
    }
    let jointMapping: unknown = {}
    try {
      jointMapping = mapping ? JSON.parse(mapping) : {}
    } catch {
      setFormError('Joint Map must be valid JSON.')
      return
    }
    if (!isJointMapping(jointMapping)) {
      setFormError('Joint Map must be a JSON object with string joint names as values.')
      return
    }
    const effectiveUrdf = selectedRobot || urdf.trim()
    const hasUrdf = Boolean(effectiveUrdf)
    let datasetAngleUnit: 'degrees' | 'radians' | null = null
    if (hasUrdf && !angleUnit) {
      setFormError('Select the angle unit used by the dataset.')
      return
    }
    if (hasUrdf) datasetAngleUnit = angleUnit as 'degrees' | 'radians'
    onLoad({
      dataset: dataset.trim(),
      policy: policy.trim() || null,
      urdf: effectiveUrdf || null,
      device,
      joint_mapping: jointMapping,
      dataset_angle_unit: datasetAngleUnit,
      demo: false,
    })
  }

  return (
    <main className="load-screen">
      <header className="load-nav">
        <a className="brand" href="/">
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <strong>LeRobot Lens</strong>
        </a>
        <a href="https://github.com/huggingface/lerobot" target="_blank" rel="noreferrer">
          <Github size={17} /> LeRobot
        </a>
      </header>
      <div className="load-grid">
        <section className="load-copy">
          <div className="eyebrow">
            <span /> LEROBOT POLICY INSPECTION
          </div>
          <h1>
            See how your
            <br />
            <em>policy responds.</em>
          </h1>
          <p>
            Run a trained policy on any recorded observation and inspect its action chunk before
            testing on a robot. Check whether it reproduces training data, or qualitatively probe
            how it responds to unseen observations.
          </p>
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
        </section>
        <section className="load-card">
          <div className="card-heading">
            <span>
              <Cpu size={19} />
            </span>
            <div>
              <h2>Open evaluation</h2>
              <p>Configure your LeRobot artifacts</p>
            </div>
          </div>
          <label>
            <span>LeRobot DATASET</span>
            <input
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              placeholder="local/path or dataset id (eg: user/dataset_name)"
            />
          </label>
          <label>
            <span>POLICY by LeRobot</span>
            <input
              value={policy}
              onChange={(e) => setPolicy(e.target.value)}
              placeholder="local/path or policy id (eg: user/policy_name)"
            />
          </label>
          <label>
            <span>
              URDF <small>OPTIONAL</small>
            </span>
            <div className="urdf-input-row">
              <input
                name="urdf-path"
                autoComplete="off"
                value={urdf}
                onChange={(e) => updateUrdf(e.target.value)}
                placeholder="/path/to/robot.urdf"
              />
              <select
                aria-label="Built-in robot"
                value={selectedRobot}
                onChange={(e) => selectRobot(e.target.value)}
              >
                <option value="">built-in</option>
                {bundledRobots.map((robot) => (
                  <option key={robot.id} value={robot.urdf}>
                    {robot.name}
                  </option>
                ))}
              </select>
            </div>
          </label>
          {(selectedRobot || urdf.trim()) && (
            <label>
              <span>
                <span className="field-label-copy">
                  DATASET ANGLE UNIT{' '}
                  <span
                    className="field-help"
                    tabIndex={0}
                    role="img"
                    aria-label={DATASET_ANGLE_UNIT_HELP}
                    data-tooltip={DATASET_ANGLE_UNIT_HELP}
                  >
                    <CircleHelp size={13} />
                  </span>
                </span>
                <small>REQUIRED FOR URDF</small>
              </span>
              <select
                value={angleUnit}
                onChange={(e) => setAngleUnit(e.target.value as '' | 'degrees' | 'radians')}
              >
                <option value="">Select dataset representation…</option>
                <option value="degrees">Degrees</option>
                <option value="radians">Radians</option>
              </select>
            </label>
          )}
          <div className="form-row">
            <label>
              <span>DEVICE</span>
              <select value={device} onChange={(e) => setDevice(e.target.value)}>
                <option value="auto">Auto detect</option>
                <option value="cpu">CPU</option>
                <option value="cuda">CUDA</option>
                <option value="mps">Apple MPS</option>
              </select>
            </label>
            <label>
              <span>
                JOINT MAP <small>JSON</small>
              </span>
              <input
                value={mapping}
                onChange={(e) => setMapping(e.target.value)}
                placeholder='{"source":"urdf"}'
              />
            </label>
          </div>
          {(formError || error) && <div className="load-error">{formError || error}</div>}
          <button className="primary-button" disabled={loading} onClick={() => submit(false)}>
            {loading ? (
              <>
                <LoaderCircle className="spin" size={18} /> Loading artifacts…
              </>
            ) : (
              <>
                Load workspace <ArrowRight size={18} />
              </>
            )}
          </button>
          <button className="demo-button" disabled={loading} onClick={() => submit(true)}>
            Explore with demo data
          </button>
          <p className="load-note">
            Artifacts stay on your machine. Hub downloads use the local Hugging Face cache.
          </p>
        </section>
      </div>
      <footer className="load-footer">
        <span>BUILT FOR LEROBOT</span>
        <span>DATASET · POLICY · URDF</span>
      </footer>
    </main>
  )
}
