import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { session } from '../../../test/fixtures'
import { WorkspaceHeader } from './WorkspaceHeader'
import styles from './WorkspaceHeader.module.css'

describe('WorkspaceHeader', () => {
  it('returns to setup from the configured brand button', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <WorkspaceHeader session={session} onClose={onClose}>
        <span>Workspace configuration</span>
      </WorkspaceHeader>,
    )

    expect(screen.getByText('Workspace configuration')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Open LeRobot Lens on GitHub' }),
    ).not.toBeInTheDocument()
    const brandButton = screen.getByRole('button', { name: 'Return to workspace setup' })
    expect(brandButton).toHaveClass(styles.brandButton)
    await user.click(brandButton)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows the GitHub link only in the unconfigured header', () => {
    render(<WorkspaceHeader session={null} />)

    const brandButton = screen.getByRole('button', { name: 'LeRobot Lens' })
    expect(brandButton).toBeDisabled()
    expect(brandButton).toHaveClass(styles.brandButton)
    const githubLink = screen.getByRole('link', { name: 'Open LeRobot Lens on GitHub' })
    expect(githubLink).toHaveClass(styles.onboardingGithubLink)
    expect(githubLink).toHaveAttribute('href', 'https://github.com/hachimada/lerobot-lens')
    expect(githubLink).toHaveAttribute('target', '_blank')
  })
})
