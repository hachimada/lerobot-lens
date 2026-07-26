import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../shared/api/client'
import type { SessionCreate } from '../../shared/api/types'
import { ArtifactForm } from './ArtifactForm'
import styles from './ArtifactForm.module.css'

vi.mock('../../shared/api/client', () => ({
  api: { getRobots: vi.fn() },
}))

const getRobots = vi.mocked(api.getRobots)

beforeEach(() => {
  getRobots.mockResolvedValue([
    { id: 'so101', name: 'SO-101 (SO-ARM100)', urdf: 'builtin://so101' },
  ])
})

const emptyWorkspace: SessionCreate = {
  dataset: '',
  policy: null,
  urdf: null,
  device: 'auto',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
}

function setup(props: Partial<React.ComponentProps<typeof ArtifactForm>> = {}) {
  const onLoad = vi.fn<(payload: SessionCreate) => void>()
  render(
    <ArtifactForm
      loading={false}
      error={null}
      initialValue={emptyWorkspace}
      onLoad={onLoad}
      variant="onboarding"
      {...props}
    />,
  )
  return { onLoad, user: userEvent.setup() }
}

describe('ArtifactForm', () => {
  it('submits the bundled demo independently of entered artifact values', async () => {
    const { onLoad, user } = setup({ showDemo: true })

    await user.type(screen.getByRole('textbox', { name: 'LeRobot DATASET' }), 'ignored/data')
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))

    expect(onLoad).toHaveBeenCalledWith({
      dataset: 'demo',
      policy: null,
      urdf: null,
      device: 'auto',
      joint_mapping: {},
      dataset_angle_unit: null,
      demo: true,
    })
  })

  it('validates the required dataset and Joint Map JSON', async () => {
    const { onLoad, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    expect(screen.getByText('Dataset path or dataset ID is required.')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'LeRobot DATASET' }), 'org/data')
    fireEvent.change(screen.getByPlaceholderText('{"dataset_joint":"urdf_joint"}'), {
      target: { value: '{bad' },
    })
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(screen.getByText('Joint Map must be valid JSON.')).toBeInTheDocument()
    expect(onLoad).not.toHaveBeenCalled()
  })

  it.each(['[]', 'null', '"joint"', '12', '{"source": 1}'])(
    'rejects a valid JSON value that is not a string-to-string Joint Map: %s',
    async (jointMap) => {
      const { onLoad, user } = setup()
      await user.type(screen.getByRole('textbox', { name: 'LeRobot DATASET' }), 'org/data')
      fireEvent.change(screen.getByPlaceholderText('{"dataset_joint":"urdf_joint"}'), {
        target: { value: jointMap },
      })

      await user.click(screen.getByRole('button', { name: 'Open workspace' }))

      expect(
        screen.getByText('Joint Map must be a JSON object with string joint names as values.'),
      ).toBeInTheDocument()
      expect(onLoad).not.toHaveBeenCalled()
    },
  )

  it('submits trimmed workspace settings and requires an angle unit for a robot', async () => {
    const { onLoad, user } = setup()

    await user.type(screen.getByRole('textbox', { name: 'LeRobot DATASET' }), ' org/data ')
    await user.type(screen.getByRole('textbox', { name: 'POLICY by LeRobot' }), ' org/policy ')
    await user.type(screen.getByRole('textbox', { name: /ROBOT/ }), ' /robots/so101.urdf ')
    fireEvent.change(screen.getByPlaceholderText('{"dataset_joint":"urdf_joint"}'), {
      target: { value: '{"shoulder_pan.pos":"shoulder_pan"}' },
    })
    await user.selectOptions(screen.getByRole('combobox', { name: 'DEVICE' }), 'cpu')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    expect(
      screen.getByText('Select the angle unit used by the dataset in Advanced settings.'),
    ).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /DATASET ANGLE UNIT/ }),
      'degrees',
    )
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(onLoad).toHaveBeenCalledWith({
      dataset: 'org/data',
      policy: 'org/policy',
      urdf: '/robots/so101.urdf',
      device: 'cpu',
      joint_mapping: { 'shoulder_pan.pos': 'shoulder_pan' },
      dataset_angle_unit: 'degrees',
      demo: false,
    })
  })

  it('selects SO-101 from the built-in catalog while preserving custom robot input', async () => {
    const { onLoad, user } = setup()
    await waitFor(() => expect(getRobots).toHaveBeenCalledOnce())
    await user.type(screen.getByRole('textbox', { name: 'LeRobot DATASET' }), 'org/data')

    const robotInput = screen.getByRole('textbox', { name: /ROBOT/ })
    const builtInSelect = screen.getByRole('combobox', { name: 'Built-in robot' })
    expect(robotInput).toHaveAttribute(
      'placeholder',
      '/path/to/robot.urdf or select from built-in models',
    )
    await user.selectOptions(builtInSelect, 'builtin://so101')
    expect(robotInput).toHaveValue('builtin://so101')
    expect(builtInSelect).toHaveValue('builtin://so101')
    await user.selectOptions(
      screen.getByRole('combobox', { name: /DATASET ANGLE UNIT/ }),
      'degrees',
    )
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    expect(onLoad).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dataset: 'org/data',
        urdf: 'builtin://so101',
        dataset_angle_unit: 'degrees',
      }),
    )

    await user.clear(robotInput)
    await user.type(robotInput, '/robots/custom.urdf')
    expect(builtInSelect).toHaveValue('')
    expect(robotInput).toHaveValue('/robots/custom.urdf')
  })

  it('offers the same built-in robot selector in the compact header variant', async () => {
    const { user } = setup({
      variant: 'header',
      initialValue: { ...emptyWorkspace, dataset: 'org/data' },
    })
    await waitFor(() => expect(getRobots).toHaveBeenCalledOnce())

    expect(screen.getByRole('textbox', { name: 'ROBOT' })).toHaveAttribute(
      'placeholder',
      '/path/to/robot.urdf or select from built-in models',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Built-in robot' }),
      'builtin://so101',
    )
    expect(screen.getByRole('textbox', { name: 'ROBOT' })).toHaveValue('builtin://so101')
    await user.click(screen.getByRole('button', { name: 'Advanced configuration' }))
    expect(screen.getByRole('combobox', { name: /DATASET ANGLE UNIT/ })).toBeInTheDocument()
  })

  it('keeps custom robot input available when the built-in catalog cannot be loaded', async () => {
    getRobots.mockRejectedValue(new Error('offline'))
    const { user } = setup()
    const robotInput = screen.getByRole('textbox', { name: /ROBOT/ })

    await user.type(robotInput, '/robots/custom.urdf')

    expect(robotInput).toHaveValue('/robots/custom.urdf')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Built-in robot' })).toBeDisabled(),
    )
  })

  it('opens advanced settings and applies edits in the compact header variant', async () => {
    const { onLoad, user } = setup({
      variant: 'header',
      initialValue: {
        ...emptyWorkspace,
        dataset: 'org/data',
        policy: 'demo://dataset-trajectory-noise',
      },
    })

    const advancedButton = screen.getByRole('button', { name: 'Advanced configuration' })
    expect(advancedButton).toHaveClass(styles.headerAdvancedTrigger)
    await user.click(advancedButton)
    expect(screen.getByRole('combobox', { name: 'DEVICE' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply workspace settings' }))

    expect(onLoad).toHaveBeenCalledWith({
      ...emptyWorkspace,
      dataset: 'org/data',
      policy: null,
    })
  })

  it('disables actions and displays backend errors while loading', () => {
    setup({ loading: true, error: 'Backend failed', showDemo: true })

    expect(screen.getByText('Backend failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Explore with demo data' })).toBeDisabled()
  })
})
