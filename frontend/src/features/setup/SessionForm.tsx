import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, ChevronRight, CircleHelp, FlaskConical } from 'lucide-react'

import type { RecentSession } from '../../app/useRecentSessions'
import { DEMO_POLICY } from '../../app/useWorkspaceSession'
import { api } from '../../shared/api/client'
import type { BundledRobot, SessionCreate } from '../../shared/api/types'
import styles from './SessionForm.module.css'

type AngleUnit = 'degrees' | 'radians'

interface Props {
  initialValue: SessionCreate
  recents?: RecentSession[]
  busy: boolean
  submitLabel: string
  onSubmit: (payload: SessionCreate) => void
  onDemo?: () => void
}

const ANGLE_UNIT_HELP =
  'URDF joints use radians. Pick the unit of the dataset joint values so the 3D robot moves correctly: degrees for values such as 90, radians for values such as 1.57.'

function isJointMapping(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(([source, target]) => source && typeof target === 'string')
  )
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))]
}

export function SessionForm({
  initialValue,
  recents = [],
  busy,
  submitLabel,
  onSubmit,
  onDemo,
}: Props) {
  const id = useId()
  const [dataset, setDataset] = useState(initialValue.dataset)
  const [policy, setPolicy] = useState(
    initialValue.policy === DEMO_POLICY ? '' : (initialValue.policy ?? ''),
  )
  const [robot, setRobot] = useState(initialValue.urdf ?? '')
  const [angleUnit, setAngleUnit] = useState<AngleUnit | ''>(initialValue.dataset_angle_unit ?? '')
  const [device, setDevice] = useState(initialValue.device)
  const [mapping, setMapping] = useState(() =>
    Object.keys(initialValue.joint_mapping).length > 0
      ? JSON.stringify(initialValue.joint_mapping, null, 2)
      : '',
  )
  const [advancedOpen, setAdvancedOpen] = useState(
    Object.keys(initialValue.joint_mapping).length > 0 || initialValue.device !== 'auto',
  )
  const [robots, setRobots] = useState<BundledRobot[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getRobots()
      .then((available) => {
        if (active) setRobots(available)
      })
      .catch(() => {
        if (active) setRobots([])
      })
    return () => {
      active = false
    }
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setFormError(null)
    if (!dataset.trim()) {
      setFormError('Enter a dataset path or Hugging Face dataset ID.')
      return
    }
    let jointMapping: unknown = {}
    try {
      jointMapping = mapping.trim() ? JSON.parse(mapping) : {}
    } catch {
      setAdvancedOpen(true)
      setFormError('Joint map must be valid JSON.')
      return
    }
    if (!isJointMapping(jointMapping)) {
      setAdvancedOpen(true)
      setFormError('Joint map must be a JSON object that maps dataset names to URDF joint names.')
      return
    }
    const urdf = robot.trim()
    if (urdf && !angleUnit) {
      setFormError('Choose the angle unit of the dataset joint values for the robot model.')
      return
    }
    onSubmit({
      dataset: dataset.trim(),
      policy: policy.trim() || null,
      urdf: urdf || null,
      device,
      joint_mapping: jointMapping,
      dataset_angle_unit: urdf ? (angleUnit as AngleUnit) : null,
      demo: false,
    })
  }

  const builtInValue = robots.some((option) => option.urdf === robot) ? robot : ''

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Session settings" noValidate>
      <fieldset className={styles.fields} disabled={busy}>
        <div>
          <label className="field-label" htmlFor={`${id}-dataset`}>
            Dataset <small>local path or Hub ID</small>
          </label>
          <input
            id={`${id}-dataset`}
            className="input"
            value={dataset}
            list={`${id}-datasets`}
            placeholder="lerobot/pusht or ~/datasets/my_dataset"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setDataset(event.target.value)}
          />
          <datalist id={`${id}-datasets`}>
            {unique(recents.map((recent) => recent.config.dataset)).map((value) => (
              <option value={value} key={value} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label" htmlFor={`${id}-policy`}>
            Policy <small>optional · checkpoint path or Hub ID</small>
          </label>
          <input
            id={`${id}-policy`}
            className="input"
            value={policy}
            list={`${id}-policies`}
            placeholder="outputs/train/…/pretrained_model or user/policy"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setPolicy(event.target.value)}
          />
          <datalist id={`${id}-policies`}>
            {unique(recents.map((recent) => recent.config.policy)).map((value) => (
              <option value={value} key={value} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label" htmlFor={`${id}-robot`}>
            Robot model <small>optional · URDF for the 3D view</small>
          </label>
          <div className={styles.robotRow}>
            <input
              id={`${id}-robot`}
              className="input"
              value={robot}
              placeholder="/path/to/robot.urdf"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setRobot(event.target.value)}
            />
            <select
              className={`input ${styles.builtIn}`}
              aria-label="Built-in robot"
              value={builtInValue}
              disabled={robots.length === 0}
              onChange={(event) => setRobot(event.target.value)}
            >
              <option value="">Built-in…</option>
              {robots.map((option) => (
                <option value={option.urdf} key={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {robot.trim() && (
          <div
            role="radiogroup"
            aria-labelledby={`${id}-angle`}
            aria-describedby={`${id}-angle-help`}
            className={styles.angleRow}
          >
            <span className={styles.angleLabel}>
              <span id={`${id}-angle`}>Dataset joint values are in</span>
              <span className={styles.help} title={ANGLE_UNIT_HELP} aria-hidden="true">
                <CircleHelp size={13} />
              </span>
              <span id={`${id}-angle-help`} className="visually-hidden">
                {ANGLE_UNIT_HELP}
              </span>
            </span>
            <div className="segmented">
              {(['degrees', 'radians'] as const).map((unit) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={angleUnit === unit}
                  key={unit}
                  onClick={() => setAngleUnit(unit)}
                >
                  {unit === 'degrees' ? 'Degrees' : 'Radians'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.advanced}>
          <button
            type="button"
            className={styles.advancedToggle}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            <ChevronRight size={14} /> Advanced
          </button>
          {advancedOpen && (
            <div className={styles.advancedFields}>
              <div>
                <label className="field-label" htmlFor={`${id}-device`}>
                  Device
                </label>
                <select
                  id={`${id}-device`}
                  className="input"
                  value={device}
                  onChange={(event) => setDevice(event.target.value)}
                >
                  <option value="auto">Auto detect</option>
                  <option value="cuda">CUDA</option>
                  <option value="mps">Apple MPS</option>
                  <option value="cpu">CPU</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor={`${id}-mapping`}>
                  Joint map <small>JSON · only for names that differ</small>
                </label>
                <textarea
                  id={`${id}-mapping`}
                  className="input"
                  value={mapping}
                  rows={3}
                  spellCheck={false}
                  placeholder='{"motor_1.pos": "shoulder_pan"}'
                  onChange={(event) => setMapping(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </fieldset>

      {formError && (
        <div className="error-banner" role="alert">
          {formError}
        </div>
      )}

      {!busy && (
        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary">
            {submitLabel} <ArrowRight size={16} />
          </button>
          {onDemo && (
            <button type="button" className="btn btn-ghost" onClick={onDemo}>
              <FlaskConical size={15} /> Try the demo
            </button>
          )}
        </div>
      )}
    </form>
  )
}
