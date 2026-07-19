import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { frame, inference, session } from '../../../test/fixtures'
import { AnalysisPanel } from './AnalysisPanel'

function renderPanel(result = inference) {
  const callbacks = {
    onInfer: vi.fn(),
    onClearInference: vi.fn(),
    onInferenceStep: vi.fn(),
    onInferencePlaying: vi.fn(),
  }
  render(
    <AnalysisPanel
      session={session}
      episodeIndex={3}
      frameIndex={4}
      frameData={frame}
      inference={result}
      inferenceStep={0}
      inferencePlaying={false}
      inferring={false}
      error={null}
      {...callbacks}
    />,
  )
  return callbacks
}

describe('AnalysisPanel', () => {
  it('shows observation state and invokes inference without a result', async () => {
    const user = userEvent.setup()
    const onInfer = vi.fn()
    render(
      <AnalysisPanel
        session={session}
        episodeIndex={3}
        frameIndex={4}
        frameData={frame}
        inference={null}
        inferenceStep={0}
        inferencePlaying={false}
        inferring={false}
        error="Policy unavailable"
        onInfer={onInfer}
        onClearInference={vi.fn()}
        onInferenceStep={vi.fn()}
        onInferencePlaying={vi.fn()}
      />,
    )
    expect(screen.getByText('#003')).toBeInTheDocument()
    expect(screen.getByText('1.250s')).toBeInTheDocument()
    expect(screen.getByText('Policy unavailable')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Infer action chunk/ }))
    expect(onInfer).toHaveBeenCalledOnce()
  })

  it('replays, restarts, and clears an inference result', async () => {
    const user = userEvent.setup()
    const callbacks = renderPanel()
    expect(screen.getByText('2 actions')).toBeInTheDocument()
    expect(screen.getByText('+0.020')).toHaveClass('good')

    await user.click(screen.getByRole('button', { name: 'Restart chunk' }))
    await user.click(screen.getByRole('button', { name: /Replay/ }))
    await user.click(screen.getByRole('button', { name: 'Clear inference' }))
    expect(callbacks.onInferenceStep).toHaveBeenCalledWith(0)
    expect(callbacks.onInferencePlaying).toHaveBeenCalledWith(true)
    expect(callbacks.onClearInference).toHaveBeenCalledOnce()
  })
})
