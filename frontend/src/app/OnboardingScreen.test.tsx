import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { SessionCreate } from '../shared/api/types'
import { OnboardingScreen } from './OnboardingScreen'

vi.mock('../shared/api/client', () => ({
  api: { getRobots: vi.fn() },
}))

const mockedApi = vi.mocked(api)
const configuration: SessionCreate = {
  dataset: '',
  policy: null,
  urdf: null,
  device: 'auto',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
}

beforeEach(() => {
  mockedApi.getRobots.mockResolvedValue([])
})

describe('OnboardingScreen', () => {
  it('renders the onboarding content and workspace form', () => {
    render(
      <OnboardingScreen
        configuration={configuration}
        loading={false}
        error={null}
        onLoad={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'LeRobot Lens' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'See how your policy responds.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'LeRobot DATASET' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'DEVICE' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open LeRobot Lens on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/hachimada/lerobot-lens',
    )
    expect(screen.getByText('Offline policy probe — not a simulator.')).toBeInTheDocument()
  })

  it('forwards workspace submissions without owning loading behavior', async () => {
    const onLoad = vi.fn()
    const user = userEvent.setup()
    render(
      <OnboardingScreen
        configuration={configuration}
        loading={false}
        error="load failed"
        onLoad={onLoad}
      />,
    )

    expect(screen.getByText('load failed')).toBeInTheDocument()
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
})
