import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ProbeView } from './probes'
import { toChunk, toProbeView } from './probes'
import { ProbeInspector } from './ProbeInspector'

function probeView(id: string, startFrame: number, offset: number, source: 'manual' | 'scan') {
  const predicted = [
    [1 + offset, 2],
    [1 + offset, 2],
  ]
  return toProbeView(
    toChunk({
      id,
      episode: 0,
      startFrame,
      source,
      result: {
        episode: 0,
        start_frame: startFrame,
        fps: 30,
        predicted_actions: predicted,
        ground_truth_actions: [
          [1, 2],
          [1, 2],
        ],
        chunk_size: 2,
      },
    }),
    [10, 10],
  )
}

function renderInspector(overrides: Partial<Parameters<typeof ProbeInspector>[0]> = {}) {
  const onSelect = vi.fn()
  render(
    <ProbeInspector
      hasPolicy
      policyLabel="act @ 020000"
      device="cuda"
      focus={null}
      probes={[] as ProbeView[]}
      actionNames={['shoulder.pos', 'gripper.pos']}
      onSelect={onSelect}
      {...overrides}
    />,
  )
  return { onSelect, user: userEvent.setup() }
}

describe('ProbeInspector', () => {
  it('points to the probe track when no probe is selected', () => {
    renderInspector()
    expect(screen.getByRole('complementary', { name: 'Probe details' })).toBeInTheDocument()
    expect(screen.getByText('act @ 020000')).toBeInTheDocument()
    expect(screen.getByText('CUDA')).toBeInTheDocument()
    expect(screen.getByText('No probe selected')).toBeInTheDocument()
    expect(screen.getByText(/Probes appear here and on the probe track/)).toBeInTheDocument()
    // Details only: every action lives in the toolbar under the timeline.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('details the selected probe and selects probes from the list', async () => {
    const good = probeView('good', 0, 0.1, 'manual')
    const poor = probeView('poor', 10, 5, 'scan')
    const { onSelect, user } = renderInspector({ focus: poor, probes: [good, poor] })

    expect(screen.getByRole('region', { name: 'Selected probe' })).toHaveTextContent('Frames 10–11')
    expect(screen.getByText('Diverging')).toBeInTheDocument()
    expect(screen.getByText('25.0% of joint range')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Error by joint' })).toHaveTextContent('shoulder')
    expect(screen.getByLabelText('From scan')).toBeInTheDocument()

    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent('10–11')
    // A click must not move focus to the item, or Space would re-select it instead of playing.
    await user.click(screen.getByRole('button', { pressed: false }))
    expect(onSelect).toHaveBeenCalledWith(good)
  })

  it('explains a browse-only session', () => {
    renderInspector({ hasPolicy: false })
    expect(screen.getByText('No policy loaded')).toBeInTheDocument()
    expect(screen.getByText('Browse-only session')).toBeInTheDocument()
    expect(screen.queryByText(/Probes in this episode/)).not.toBeInTheDocument()
  })
})
