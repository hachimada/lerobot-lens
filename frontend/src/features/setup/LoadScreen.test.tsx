import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../../shared/api/client'
import type { SessionCreate } from '../../shared/api/types'
import { LoadScreen } from './LoadScreen'

vi.mock('../../shared/api/client', () => ({
  api: { getRobots: vi.fn() },
}))

const getRobots = vi.mocked(api.getRobots)

beforeEach(() => {
  getRobots.mockResolvedValue([
    { id: 'so101', name: 'SO-101 (SO-ARM100)', urdf: 'builtin://so101' },
  ])
})

function setup() {
  const onLoad = vi.fn<(payload: SessionCreate) => void>()
  render(<LoadScreen loading={false} error={null} onLoad={onLoad} />)
  return { user: userEvent.setup(), onLoad }
}

describe('LoadScreen', () => {
  it('submits a canonical demo payload independently of form values', async () => {
    const { user, onLoad } = setup()
    await user.type(screen.getByPlaceholderText(/dataset id/), 'ignored/data')
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

  it('requires a dataset and valid Joint Map JSON', async () => {
    const { user, onLoad } = setup()
    await user.click(screen.getByRole('button', { name: /Load workspace/ }))
    expect(screen.getByText('Dataset path or dataset ID is required.')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/dataset id/), ' org/data ')
    fireEvent.change(screen.getByPlaceholderText('{"source":"urdf"}'), {
      target: { value: '{bad' },
    })
    await user.click(screen.getByRole('button', { name: /Load workspace/ }))
    expect(screen.getByText('Joint Map must be valid JSON.')).toBeInTheDocument()
    expect(onLoad).not.toHaveBeenCalled()
  })

  it.each(['[]', 'null', '"joint"', '12', '{"source": 1}'])(
    'rejects a Joint Map that is valid JSON but not a string map: %s',
    async (jointMap) => {
      const { user, onLoad } = setup()
      await user.type(screen.getByPlaceholderText(/dataset id/), 'org/data')
      fireEvent.change(screen.getByPlaceholderText('{"source":"urdf"}'), {
        target: { value: jointMap },
      })

      await user.click(screen.getByRole('button', { name: /Load workspace/ }))

      expect(
        screen.getByText('Joint Map must be a JSON object with string joint names as values.'),
      ).toBeInTheDocument()
      expect(onLoad).not.toHaveBeenCalled()
    },
  )

  it('loads bundled robots and requires an angle unit when one is selected', async () => {
    const { user, onLoad } = setup()
    await waitFor(() => expect(getRobots).toHaveBeenCalledOnce())
    await user.type(screen.getByPlaceholderText(/dataset id/), ' org/data ')
    await user.type(screen.getByPlaceholderText(/policy id/), ' org/policy ')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Built-in robot' }),
      'builtin://so101',
    )
    await user.click(screen.getByRole('button', { name: /Load workspace/ }))
    expect(screen.getByText('Select the angle unit used by the dataset.')).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: /DATASET ANGLE UNIT/ }),
      'degrees',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'DEVICE' }), 'cpu')
    await user.click(screen.getByRole('button', { name: /Load workspace/ }))

    expect(onLoad).toHaveBeenLastCalledWith({
      dataset: 'org/data',
      policy: 'org/policy',
      urdf: 'builtin://so101',
      device: 'cpu',
      joint_mapping: {},
      dataset_angle_unit: 'degrees',
      demo: false,
    })
  })

  it('keeps manual and built-in URDF selection mutually exclusive', async () => {
    const { user } = setup()
    const pathInput = screen.getByPlaceholderText('/path/to/robot.urdf')
    const robotSelect = screen.getByRole('combobox', { name: 'Built-in robot' })

    await user.type(pathInput, '/robots/custom.urdf')
    expect(screen.getByRole('combobox', { name: /DATASET ANGLE UNIT/ })).toBeInTheDocument()
    await user.selectOptions(robotSelect, 'builtin://so101')
    expect(pathInput).toHaveValue('')

    await user.type(pathInput, '/robots/other.urdf')
    expect(robotSelect).toHaveValue('')
  })

  it('keeps the form usable if the robot catalog request fails', async () => {
    getRobots.mockRejectedValue(new Error('offline'))
    const { user, onLoad } = setup()
    await user.type(screen.getByPlaceholderText(/dataset id/), 'org/data')
    await user.click(screen.getByRole('button', { name: /Load workspace/ }))
    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ dataset: 'org/data' }))
  })

  it('disables actions and renders backend errors while loading', () => {
    render(<LoadScreen loading error="Backend failed" onLoad={vi.fn()} />)
    expect(screen.getByText('Backend failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Loading artifacts/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Explore with demo data' })).toBeDisabled()
  })
})
