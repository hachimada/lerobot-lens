import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { timestamp } from '../timeline'
import { Timeline } from './Timeline'

describe('timestamp', () => {
  it('formats frames as minute and second timecodes', () => {
    expect(timestamp(0, 30)).toBe('0:00.00')
    expect(timestamp(1950, 30)).toBe('1:05.00')
  })
})

describe('Timeline', () => {
  it('clamps frame controls and reports playback and speed changes', async () => {
    const user = userEvent.setup()
    const onFrame = vi.fn()
    const onPlaying = vi.fn()
    const onSpeed = vi.fn()
    const props = {
      length: 3,
      fps: 10,
      playing: false,
      speed: 1,
      onFrame,
      onPlaying,
      onSpeed,
    }
    const { rerender } = render(<Timeline frame={0} {...props} />)

    await user.click(screen.getByRole('button', { name: 'Previous frame' }))
    await user.click(screen.getByRole('button', { name: 'Next frame' }))
    await user.click(screen.getByRole('button', { name: 'Restart' }))
    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: '2×' }))
    fireEvent.change(screen.getByRole('slider', { name: 'Episode timeline' }), {
      target: { value: '2' },
    })
    rerender(<Timeline frame={2} {...props} />)
    await user.click(screen.getByRole('button', { name: 'Next frame' }))

    expect(onFrame.mock.calls).toEqual([[0], [1], [0], [2], [2]])
    expect(onPlaying).toHaveBeenCalledWith(true)
    expect(onSpeed).toHaveBeenCalledWith(2)
  })

  it('renders the action chunk range and pause state', () => {
    render(
      <Timeline
        frame={2}
        length={5}
        fps={2}
        playing
        speed={1}
        inferenceRange={[1, 3]}
        onFrame={vi.fn()}
        onPlaying={vi.fn()}
        onSpeed={vi.fn()}
      />,
    )
    expect(screen.getByText('action chunk')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })
})
