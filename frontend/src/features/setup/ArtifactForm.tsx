import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  LoaderCircle,
  Settings2,
  Sparkles,
} from 'lucide-react'

import { api } from '../../shared/api/client'
import type { BundledRobot, SessionCreate } from '../../shared/api/types'
import styles from './ArtifactForm.module.css'

interface Props {
  loading: boolean
  error: string | null
  onLoad: (payload: SessionCreate) => void
  initialValue: SessionCreate
  showDemo?: boolean
  variant?: 'header' | 'onboarding'
}

const DATASET_ANGLE_UNIT_HELP =
  "URDF joints use radians. To reproduce the dataset's motion correctly in the URDF viewer, select the angle unit used by the dataset's joint values. Choose Degrees for values such as 90, or Radians for values such as 1.57."

const DEMO_POLICY_VALUE = 'demo://dataset-trajectory-noise'

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

export function ArtifactForm({
  loading,
  error,
  onLoad,
  initialValue,
  showDemo = false,
  variant = 'header',
}: Props) {
  const [dataset, setDataset] = useState(initialValue.dataset)
  const [policy, setPolicy] = useState(initialValue.policy ?? '')
  const [robot, setRobot] = useState(initialValue.urdf ?? '')
  const [device, setDevice] = useState(initialValue.device)
  const [mapping, setMapping] = useState(() => {
    const initialMapping = initialValue.joint_mapping
    return Object.keys(initialMapping).length > 0 ? JSON.stringify(initialMapping) : ''
  })
  const [angleUnit, setAngleUnit] = useState<'' | 'degrees' | 'radians'>(
    initialValue.dataset_angle_unit ?? '',
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [builtInRobots, setBuiltInRobots] = useState<BundledRobot[]>([])
  const isOnboarding = variant === 'onboarding'

  useEffect(() => {
    let active = true
    api
      .getRobots()
      .then((robots) => {
        if (active) setBuiltInRobots(robots)
      })
      .catch(() => {
        if (active) setBuiltInRobots([])
      })
    return () => {
      active = false
    }
  }, [])

  const submitDemo = () => {
    setFormError(null)
    onLoad({
      dataset: 'demo',
      policy: null,
      urdf: null,
      device,
      joint_mapping: {},
      dataset_angle_unit: null,
      demo: true,
    })
  }

  const submitWorkspace = () => {
    setFormError(null)
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
    const effectiveRobot = robot.trim()
    let datasetAngleUnit: 'degrees' | 'radians' | null = null
    if (effectiveRobot && !angleUnit) {
      setFormError('Select the angle unit used by the dataset in Advanced settings.')
      return
    }
    if (effectiveRobot) datasetAngleUnit = angleUnit as 'degrees' | 'radians'
    const effectivePolicy = policy.trim()
    onLoad({
      dataset: dataset.trim(),
      policy: effectivePolicy === DEMO_POLICY_VALUE ? null : effectivePolicy || null,
      urdf: effectiveRobot || null,
      device,
      joint_mapping: jointMapping,
      dataset_angle_unit: datasetAngleUnit,
      demo: false,
    })
  }

  const advancedFields = (
    <div className={styles.advancedConfigurationFields}>
      <label>
        <span>DEVICE</span>
        <select value={device} onChange={(event) => setDevice(event.target.value)}>
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
          onChange={(event) => setMapping(event.target.value)}
          placeholder='{"dataset_joint":"urdf_joint"}'
        />
      </label>
      {robot.trim() && (
        <label className={styles.angleUnitField}>
          <span>
            <span className={styles.fieldLabelCopy}>
              DATASET ANGLE UNIT{' '}
              <span
                className={styles.fieldHelp}
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
            onChange={(event) => setAngleUnit(event.target.value as '' | 'degrees' | 'radians')}
          >
            <option value="">Select dataset representation…</option>
            <option value="degrees">Degrees</option>
            <option value="radians">Radians</option>
          </select>
        </label>
      )}
    </div>
  )

  return (
    <section
      className={
        isOnboarding
          ? `${styles.configurationBar} ${styles.onboardingConfiguration}`
          : styles.configurationBar
      }
      aria-label="Workspace artifacts"
    >
      <div className={styles.configurationPrimary}>
        <ArtifactInput
          icon={<Database size={15} />}
          label="DATASET"
          value={dataset}
          placeholder="local/path or user/dataset_name"
          onChange={setDataset}
          variant={variant}
        />
        <ArtifactInput
          icon={<Sparkles size={15} />}
          label="POLICY"
          value={policy}
          placeholder="local/path or user/policy_name"
          onChange={setPolicy}
          variant={variant}
        />
        <RobotArtifactInput
          icon={<Box size={15} />}
          value={robot}
          placeholder="/path/to/robot.urdf or select from built-in models"
          onChange={setRobot}
          options={builtInRobots}
          variant={variant}
        />
        {!isOnboarding && (
          <>
            <div
              className={
                advancedOpen
                  ? `${styles.headerAdvancedConfiguration} ${styles.isOpen}`
                  : styles.headerAdvancedConfiguration
              }
            >
              <button
                type="button"
                className={styles.headerAdvancedTrigger}
                aria-label="Advanced configuration"
                aria-expanded={advancedOpen}
                title="Advanced configuration"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                <Settings2 size={18} />
              </button>
              {advancedOpen && advancedFields}
            </div>
            <button
              type="button"
              className={styles.applyConfiguration}
              aria-label="Apply workspace settings"
              aria-busy={loading}
              title="Apply workspace settings"
              disabled={loading}
              onClick={submitWorkspace}
            >
              {loading ? <LoaderCircle className="spin" size={18} /> : <Check size={19} />}
            </button>
          </>
        )}
      </div>

      {isOnboarding && <div className={styles.onboardingAdvanced}>{advancedFields}</div>}

      {(formError || error) && (
        <div className={styles.configurationError}>{formError || error}</div>
      )}
      {isOnboarding && (
        <button
          type="button"
          className={`${styles.applyConfiguration} ${styles.onboardingApply}`}
          aria-label="Open workspace"
          aria-busy={loading}
          title="Open workspace"
          disabled={loading}
          onClick={submitWorkspace}
        >
          {loading ? (
            <>
              <LoaderCircle className="spin" size={18} />
              Loading workspace…
            </>
          ) : (
            <>
              Open workspace <ArrowRight size={18} />
            </>
          )}
        </button>
      )}
      {showDemo && (
        <button
          type="button"
          className={styles.configurationDemo}
          disabled={loading}
          onClick={submitDemo}
        >
          {isOnboarding ? 'Explore with demo data' : 'Explore with bundled demo'}
        </button>
      )}
    </section>
  )
}

interface ArtifactInputProps {
  icon: ReactNode
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  variant: 'header' | 'onboarding'
}

function ArtifactInput({ icon, label, value, placeholder, onChange, variant }: ArtifactInputProps) {
  if (variant === 'onboarding') {
    const onboardingPlaceholder =
      label === 'DATASET'
        ? 'local/path or dataset id (eg: user/dataset_name)'
        : label === 'POLICY'
          ? 'local/path or policy id (eg: user/policy_name)'
          : placeholder
    return (
      <label className={styles.onboardingArtifactField}>
        <span>
          {label === 'DATASET'
            ? 'LeRobot DATASET'
            : label === 'POLICY'
              ? 'POLICY by LeRobot'
              : label}
          {label === 'ROBOT' && <small>OPTIONAL</small>}
        </span>
        <input
          value={value}
          placeholder={onboardingPlaceholder}
          title={value || onboardingPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  return (
    <label className={styles.artifactEditor}>
      <span>{icon}</span>
      <span className={styles.artifactEditorCopy}>
        <strong>{label}</strong>
        <input
          value={value}
          placeholder={placeholder}
          title={value || placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  )
}

interface RobotArtifactInputProps {
  icon: ReactNode
  value: string
  placeholder: string
  onChange: (value: string) => void
  options: BundledRobot[]
  variant: 'header' | 'onboarding'
}

function RobotArtifactInput({
  icon,
  value,
  placeholder,
  onChange,
  options,
  variant,
}: RobotArtifactInputProps) {
  const selectedBuiltIn = options.some((robot) => robot.urdf === value) ? value : ''
  const control = (
    <div className={styles.robotArtifactControl}>
      <input
        aria-label={variant === 'onboarding' ? 'ROBOT OPTIONAL' : 'ROBOT'}
        value={value}
        placeholder={placeholder}
        title={value || placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <select
        className={styles.builtInRobotSelect}
        aria-label="Built-in robot"
        title="Choose a built-in robot"
        value={selectedBuiltIn}
        disabled={options.length === 0}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value)
        }}
      >
        <option value="">Choose built-in robot…</option>
        {options.map((robot) => (
          <option value={robot.urdf} key={robot.id}>
            {robot.name}
          </option>
        ))}
      </select>
      <ChevronDown className={styles.builtInRobotChevron} size={15} aria-hidden="true" />
    </div>
  )

  if (variant === 'onboarding') {
    return (
      <div className={styles.onboardingArtifactField}>
        <span>
          ROBOT <small>OPTIONAL</small>
        </span>
        {control}
      </div>
    )
  }

  return (
    <div className={styles.artifactEditor}>
      <span>{icon}</span>
      <span className={styles.artifactEditorCopy}>
        <strong>ROBOT</strong>
        {control}
      </span>
    </div>
  )
}
