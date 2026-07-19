import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { EpisodeActions } from '../../../shared/api/types'
import { linePath } from '../actionGraph'
import { ActionGraphs } from './ActionGraphs'

const actions: EpisodeActions = {
  episode: 0,
  fps: 10,
  action_names: ['shoulder', 'elbow'],
  actions: [
    [0, 2],
    [1, 3],
  ],
}

describe('linePath', () => {
  it('maps frame and value ranges into the SVG plot', () => {
    expect(linePath([0, 1], 0, 2, 0, 1)).toBe('M58.00,276.00 L1098.00,24.00')
  })
})

describe('ActionGraphs', () => {
  it('shows loading state until episode actions are available', () => {
    render(<ActionGraphs episodeActions={null} inference={null} currentFrame={0} />)
    expect(screen.getByText('Loading episode actions…')).toBeInTheDocument()
  })

  it('toggles joints independently and restores all series', async () => {
    const user = userEvent.setup()
    render(<ActionGraphs episodeActions={actions} inference={null} currentFrame={0} />)
    expect(screen.getByRole('img', { name: /Selected joint actions/ })).toBeInTheDocument()

    const shoulder = screen.getByRole('button', { name: /shoulder.*ON/ })
    const elbow = screen.getByRole('button', { name: /elbow.*ON/ })
    await user.click(shoulder)
    await user.click(elbow)
    expect(screen.getByText('No joints selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByRole('img', { name: /Selected joint actions/ })).toBeInTheDocument()
  })
})
