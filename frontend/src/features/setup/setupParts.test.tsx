import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEmptyConfiguration } from '../../app/useWorkspaceSession'
import { api } from '../../shared/api/client'
import { Modal } from '../../shared/ui/Modal'
import { LoadingProgress } from './LoadingProgress'
import { RecentSessions } from './RecentSessions'
import { SessionDialog } from './SessionDialog'

vi.mock('../../shared/api/client', () => ({ api: { getRobots: vi.fn() } }))

const recent = {
  config: {
    ...createEmptyConfiguration(),
    dataset: '/data/my_dataset',
    policy: '/out/act/checkpoints/020000/pretrained_model',
  },
  openedAt: Date.now() - 120_000,
}

beforeEach(() => vi.mocked(api.getRobots).mockResolvedValue([]))
afterEach(() => vi.useRealTimers())

describe('LoadingProgress', () => {
  it('shows step progress, elapsed time, a slow-load hint, and cancel', () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const startedAt = Date.now()
    const { rerender } = render(
      <LoadingProgress
        loading={{ message: 'Loading dataset metadata…', startedAt, hasPolicy: true }}
        onCancel={onCancel}
      />,
    )
    const steps = screen.getAllByRole('listitem')
    expect(steps[0]).toHaveAttribute('data-status', 'active')
    expect(steps[1]).toHaveAttribute('data-status', 'pending')
    expect(screen.queryByText(/can take a while/)).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(9000))
    expect(screen.getByText('9s')).toBeInTheDocument()
    expect(screen.getByText(/can take a while/)).toBeInTheDocument()

    rerender(
      <LoadingProgress
        loading={{ message: 'Loading policy…', startedAt, hasPolicy: true }}
        onCancel={onCancel}
      />,
    )
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-status', 'done')
    expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('data-status', 'active')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()

    rerender(
      <LoadingProgress
        loading={{ message: 'Loading dataset metadata…', startedAt, hasPolicy: false }}
        onCancel={onCancel}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('RecentSessions', () => {
  it('opens and forgets recent sessions, showing the checkpoint step', async () => {
    const onOpen = vi.fn()
    const onForget = vi.fn()
    const user = userEvent.setup()
    const { container, rerender } = render(
      <RecentSessions recents={[recent]} onOpen={onOpen} onForget={onForget} />,
    )
    expect(screen.getByText('my_dataset')).toBeInTheDocument()
    expect(screen.getByText('@020000')).toBeInTheDocument()
    expect(screen.getByText('2m ago')).toBeInTheDocument()

    await user.click(screen.getByText('my_dataset'))
    expect(onOpen).toHaveBeenCalledWith(recent.config)
    await user.click(screen.getByRole('button', { name: /Remove my_dataset/ }))
    expect(onForget).toHaveBeenCalledWith(recent.config)

    rerender(
      <RecentSessions
        recents={[{ ...recent, config: { ...recent.config, policy: null } }]}
        onOpen={onOpen}
        onForget={onForget}
      />,
    )
    expect(screen.getByText('Dataset only')).toBeInTheDocument()
    rerender(<RecentSessions recents={[]} onOpen={onOpen} onForget={onForget} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Modal', () => {
  it('focuses the first field, closes on Escape or backdrop, and restores focus', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()
    const { unmount } = render(
      <Modal title="Settings" description="Details" onClose={onClose}>
        <input aria-label="name" />
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('name')).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(3)

    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('cannot be dismissed while it is busy', () => {
    const onClose = vi.fn()
    render(
      <Modal title="Busy" dismissible={false} onClose={onClose}>
        <p>Working</p>
      </Modal>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument()
  })
})

describe('SessionDialog', () => {
  it('shows the form with recents, or progress and errors while loading', async () => {
    const props = {
      configuration: { ...createEmptyConfiguration(), dataset: 'org/data' },
      recents: [recent],
      error: null,
      onSubmit: vi.fn(),
      onCancelLoading: vi.fn(),
      onForgetRecent: vi.fn(),
      onClose: vi.fn(),
    }
    const { rerender } = render(<SessionDialog {...props} loading={null} />)
    expect(screen.getByRole('dialog', { name: 'Change session' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /^Dataset/ })).toHaveValue('org/data')
    await userEvent.setup().click(screen.getByText('my_dataset'))
    expect(props.onSubmit).toHaveBeenCalledWith(recent.config)

    rerender(
      <SessionDialog
        {...props}
        error="Policy not found"
        loading={{ message: 'Loading policy…', startedAt: Date.now(), hasPolicy: true }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Policy not found')
    expect(screen.getByRole('status')).toHaveTextContent('Opening session')
    expect(screen.queryByRole('button', { name: 'Close dialog' })).not.toBeInTheDocument()
  })
})
