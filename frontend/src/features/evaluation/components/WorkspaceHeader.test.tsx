import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { session } from '../../../test/fixtures'
import { WorkspaceHeader } from './WorkspaceHeader'

describe('WorkspaceHeader', () => {
  it('shows graph mode and closes from the brand button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<WorkspaceHeader session={session} onClose={onClose} />)
    expect(screen.getByText('No URDF · Graph mode')).toBeInTheDocument()
    expect(screen.getByText('READY · CPU')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'LeRobot Lens' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('distinguishes bundled demo and user-provided URDFs', () => {
    const { rerender } = render(
      <WorkspaceHeader session={{ ...session, has_urdf: true, demo: true }} onClose={vi.fn()} />,
    )
    expect(screen.getByText('SO-101 · Bundled URDF')).toBeInTheDocument()
    rerender(
      <WorkspaceHeader session={{ ...session, has_urdf: true, demo: false }} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Loaded URDF')).toBeInTheDocument()
  })
})
