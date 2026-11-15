import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyConfiguration, DEMO_POLICY } from '../../app/useWorkspaceSession'
import { api } from '../../shared/api/client'
import type { SessionCreate } from '../../shared/api/types'
import { SessionForm } from './SessionForm'

vi.mock('../../shared/api/client', () => ({ api: { getRobots: vi.fn() } }))
const getRobots = vi.mocked(api.getRobots)

beforeEach(() => {
  getRobots.mockResolvedValue([{ id: 'so101', name: 'SO-101', urdf: 'builtin://so101' }])
})

function renderForm(initialValue: SessionCreate = createEmptyConfiguration(), busy = false) {
  const onSubmit = vi.fn()
  const onDemo = vi.fn()
  render(
    <SessionForm
      initialValue={initialValue}
      recents={[
        {
          config: { ...createEmptyConfiguration(), dataset: 'org/old', policy: 'org/p' },
          openedAt: 1,
        },
      ]}
      busy={busy}
      submitLabel="Open workspace"
      onSubmit={onSubmit}
      onDemo={onDemo}
    />,
  )
  return { onSubmit, onDemo, user: userEvent.setup() }
}

const dataset = () => screen.getByRole('combobox', { name: /^Dataset/ })
const policy = () => screen.getByRole('combobox', { name: /^Policy/ })
const robot = () => screen.getByRole('textbox', { name: /^Robot model/ })

describe('SessionForm', () => {
  it('submits trimmed values and suggests recent artifacts', async () => {
    const { onSubmit, user } = renderForm()
    expect(document.querySelector('datalist option[value="org/old"]')).not.toBeNull()
    expect(document.querySelector('datalist option[value="org/p"]')).not.toBeNull()

    await user.type(dataset(), '  org/data ')
    await user.type(policy(), ' org/policy ')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(onSubmit).toHaveBeenCalledWith({
      dataset: 'org/data',
      policy: 'org/policy',
      urdf: null,
      device: 'auto',
      joint_mapping: {},
      dataset_angle_unit: null,
      demo: false,
    })
  })

  it('requires a dataset and an angle unit for a robot model', async () => {
    const { onSubmit, user } = renderForm()
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a dataset path')

    await user.type(dataset(), 'org/data')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Built-in robot' })).toBeEnabled(),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Built-in robot' }), 'SO-101')
    expect(robot()).toHaveValue('builtin://so101')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the angle unit')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('radio', { name: 'Radians' }))
    expect(screen.getByRole('radio', { name: 'Radians' })).toHaveAttribute('aria-checked', 'true')
    await user.type(dataset(), '{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        urdf: 'builtin://so101',
        dataset_angle_unit: 'radians',
        policy: null,
      }),
    )
  })

  it('validates the joint map and opens advanced settings to show the problem', async () => {
    const { onSubmit, user } = renderForm({
      ...createEmptyConfiguration(),
      dataset: 'org/data',
      device: 'cuda',
      joint_mapping: { 'motor_1.pos': 'shoulder' },
    })
    const mapping = screen.getByRole('textbox', { name: /Joint map/ })
    expect(screen.getByRole('combobox', { name: 'Device' })).toHaveValue('cuda')

    await user.clear(mapping)
    await user.type(mapping, '{{not json')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('valid JSON')

    await user.clear(mapping)
    await user.click(mapping)
    await user.paste('[1]')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('JSON object')

    await user.click(screen.getByRole('button', { name: 'Advanced' }))
    expect(screen.queryByRole('textbox', { name: /Joint map/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Advanced' }))
    await user.clear(screen.getByRole('textbox', { name: /Joint map/ }))
    await user.type(screen.getByRole('textbox', { name: /Joint map/ }), '{{"a": "b"}')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Device' }), 'cpu')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ joint_mapping: { a: 'b' }, device: 'cpu' }),
    )
  })

  it('clears the demo policy, offers the demo, and hides actions while busy', async () => {
    getRobots.mockRejectedValueOnce(new Error('offline'))
    const { onDemo, user } = renderForm({ ...createEmptyConfiguration(), policy: DEMO_POLICY })
    expect(policy()).toHaveValue('')
    await user.click(screen.getByRole('button', { name: /Try the demo/ }))
    expect(onDemo).toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Built-in robot' })).toBeDisabled(),
    )
  })

  it('locks the fields while a session is opening', () => {
    renderForm(createEmptyConfiguration(), true)
    expect(dataset()).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Open workspace/ })).not.toBeInTheDocument()
  })
})
