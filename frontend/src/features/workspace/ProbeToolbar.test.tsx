import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmButton } from '../../shared/ui/ConfirmButton'
import { ChunkPlayer } from './ChunkPlayer'
import { toChunk, toProbeView } from './probes'
import { ProbeToolbar } from './ProbeToolbar'
import { ProbeTrack } from './ProbeTrack'

function probeView(id: string, startFrame: number, steps: number, offset = 0) {
  const truth = Array.from({ length: steps }, () => [1, 2])
  return toProbeView(
    toChunk({
      id,
      episode: 0,
      startFrame,
      source: 'scan',
      result: {
        episode: 0,
        start_frame: startFrame,
        fps: 30,
        predicted_actions: truth.map(([a, b]) => [a + offset, b]),
        ground_truth_actions: truth,
        chunk_size: steps,
      },
    }),
    [10, 10],
  )
}

afterEach(() => vi.useRealTimers())

function renderToolbar(overrides: Partial<Parameters<typeof ProbeToolbar>[0]> = {}) {
  const handlers = {
    onProbe: vi.fn(),
    onScan: vi.fn(),
    onCancelScan: vi.fn(),
    onClearAll: vi.fn(),
    onDismissError: vi.fn(),
    onAddPolicy: vi.fn(),
  }
  const props = {
    hasPolicy: true,
    frame: 30,
    frameCount: 100,
    chunkSize: 50,
    probeCount: 3,
    probing: false,
    scan: null,
    error: null,
    ...handlers,
    ...overrides,
  }
  const view = render(<ProbeToolbar {...props} />)
  return { ...view, handlers, props, user: userEvent.setup() }
}

describe('ProbeToolbar', () => {
  it('probes the whole episode with or without overlap, or one frame', async () => {
    const { handlers, user } = renderToolbar()
    const buttons = screen.getAllByRole('button')
    // The whole-episode probe leads; a single frame is the secondary check.
    expect(buttons[0]).toHaveTextContent('Probe whole episode')

    const overlap = screen.getByRole('combobox', { name: 'Chunk overlap' })
    expect(overlap).toHaveDisplayValue('0')
    expect(screen.getByText('· 2 chunks, every 50 frames')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Probe whole episode/ }))
    expect(handlers.onScan).toHaveBeenLastCalledWith(50)

    // Sharing 10 steps between consecutive chunks probes every 40 frames.
    await user.selectOptions(overlap, '10')
    expect(screen.getByText('· 3 chunks, every 40 frames')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Probe whole episode/ }))
    expect(handlers.onScan).toHaveBeenLastCalledWith(40)
    expect(screen.queryByRole('option', { name: '50' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Probe frame 30/ }))
    expect(handlers.onProbe).toHaveBeenCalled()

    // Clearing every probe in the episode asks for a second click.
    await user.click(screen.getByRole('button', { name: /Clear all probes/ }))
    expect(handlers.onClearAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear 3 probes' }))
    expect(handlers.onClearAll).toHaveBeenCalledTimes(1)
  })

  it('shows progress, busy probing, and dismissible errors', async () => {
    const { handlers, user, rerender, props } = renderToolbar({
      scan: { episode: 0, completed: 3, total: 10 },
      error: 'CUDA out of memory',
    })
    expect(screen.getByRole('status')).toHaveTextContent('Probing chunk 3 / 10')
    expect(screen.getByRole('button', { name: /Probe frame 30/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Clear all probes/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    expect(handlers.onCancelScan).toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('CUDA out of memory')
    await user.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(handlers.onDismissError).toHaveBeenCalled()

    rerender(<ProbeToolbar {...props} scan={null} probing />)
    expect(screen.getByRole('button', { name: /Running policy/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Probe whole episode/ })).toBeDisabled()
  })

  it('waits for a known chunk length, and offers a policy to browse-only sessions', async () => {
    const { rerender, props, handlers, user } = renderToolbar({ chunkSize: null, probeCount: 1 })
    expect(screen.getByRole('combobox', { name: 'Chunk overlap' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Probe whole episode/ })).toBeDisabled()
    expect(screen.queryByText(/chunks, every/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Clear all probes/ }))
    expect(screen.getByRole('button', { name: 'Clear 1 probe' })).toBeInTheDocument()
    rerender(<ProbeToolbar {...props} probeCount={0} />)
    expect(screen.queryByRole('button', { name: /Clear all probes/ })).not.toBeInTheDocument()

    rerender(<ProbeToolbar {...props} hasPolicy={false} />)
    expect(screen.queryByRole('button', { name: /Probe frame/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add a policy/ }))
    expect(handlers.onAddPolicy).toHaveBeenCalled()
  })
})

describe('ProbeToolbar before the first probe', () => {
  it('leads with probing the whole episode, and offers a single frame', async () => {
    const { handlers, user, rerender, props } = renderToolbar({ probeCount: 0 })
    expect(screen.getByText('Or check a single frame:')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Clear all probes/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Probe whole episode/ }))
    expect(handlers.onScan).toHaveBeenCalledWith(50)
    await user.click(screen.getByRole('button', { name: /Probe frame 30/ }))
    expect(handlers.onProbe).toHaveBeenCalled()

    // Once a whole-episode probe runs, its progress replaces the call to action.
    rerender(<ProbeToolbar {...props} scan={{ episode: 0, completed: 0, total: 2 }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Probing chunk 0 / 2')
    expect(screen.queryByText('Or check a single frame:')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear all probes/ })).toBeDisabled()
  })
})

describe('ProbeTrack', () => {
  it('stacks overlapping chunks and selects one on click', async () => {
    const onSelect = vi.fn()
    const probes = [probeView('a', 0, 50), probeView('b', 40, 50, 5), probeView('c', 80, 20)]
    const user = userEvent.setup()
    const { rerender } = render(
      <ProbeTrack
        probes={probes}
        selectedId={null}
        frameCount={101}
        recordingFrame={30}
        onSelect={onSelect}
      />,
    )
    const track = screen.getByRole('group', { name: 'Probe chunks' })
    // Overlapping chunks go to separate rows so each stays clickable.
    expect(track.children[0].children).toHaveLength(2)
    expect(track.children[1].children).toHaveLength(1)
    expect(screen.getByTitle('Recording at frame 30')).toBeInTheDocument()

    const diverging = screen.getByRole('button', { name: 'Probe 40–89, Diverging' })
    await user.click(diverging)
    expect(onSelect).toHaveBeenCalledWith(probes[1])

    rerender(
      <ProbeTrack
        probes={probes}
        selectedId="b"
        frameCount={101}
        recordingFrame={30}
        stepFrame={52}
        onSelect={onSelect}
      />,
    )
    expect(diverging).toHaveAttribute('aria-pressed', 'true')
    expect(track).toHaveAttribute('data-has-selection', 'true')
    expect(screen.getByTitle('Chunk step on the stage')).toBeInTheDocument()
  })

  it('keeps an empty lane while the first chunks arrive', () => {
    render(
      <ProbeTrack
        probes={[]}
        selectedId={null}
        frameCount={10}
        recordingFrame={4}
        onSelect={vi.fn()}
      />,
    )
    const track = screen.getByRole('group', { name: 'Probe chunks' })
    expect(track.children[0].children).toHaveLength(0)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByTitle('Recording at frame 4')).toBeInTheDocument()
  })
})

describe('ChunkPlayer', () => {
  function playerHandlers() {
    return { onTogglePlay: vi.fn(), onPlayAll: vi.fn(), onSeekStep: vi.fn(), onRemove: vi.fn() }
  }

  it("steps through the selected probe's chunk and removes probes", async () => {
    const handlers = playerHandlers()
    const probe = probeView('p1', 30, 2)
    const user = userEvent.setup()
    const { rerender } = render(
      <ChunkPlayer probe={probe} count={3} active step={0} playing playingAll {...handlers} />,
    )
    const player = screen.getByRole('group', { name: 'Chunk player' })
    expect(player).toHaveTextContent('Probe 30–31')
    expect(player).toHaveTextContent('On track')
    expect(player).toHaveTextContent('Step 1 / 2 · frame 30')
    await user.click(screen.getByRole('button', { name: 'Pause chunk' }))
    expect(handlers.onTogglePlay).toHaveBeenCalled()
    const playAll = screen.getByRole('button', { name: /Play all chunks/ })
    expect(playAll).toHaveAttribute('aria-pressed', 'true')
    await user.click(playAll)
    expect(handlers.onPlayAll).toHaveBeenCalled()

    rerender(
      <ChunkPlayer
        probe={probe}
        count={3}
        active={false}
        step={1}
        playing={false}
        playingAll={false}
        {...handlers}
      />,
    )
    expect(screen.getByRole('button', { name: 'Play chunk' })).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Chunk step' })
    expect(slider).toHaveValue('1')
    fireEvent.change(slider, { target: { value: '0' } })
    expect(handlers.onSeekStep).toHaveBeenCalledWith(0)

    await user.click(screen.getByRole('button', { name: /Remove this probe/ }))
    expect(handlers.onRemove).toHaveBeenCalledWith('p1')
  })

  it('asks for a selection, and hides without probes', () => {
    const handlers = playerHandlers()
    const props = { active: false, step: 0, playing: false, playingAll: false, ...handlers }
    const { container, rerender } = render(<ChunkPlayer probe={null} count={1} {...props} />)
    expect(screen.getByText(/select a chunk above/)).toBeInTheDocument()
    // Every chunk can play in turn without picking one first.
    expect(screen.getByRole('button', { name: /Play all chunks/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    rerender(<ChunkPlayer probe={null} count={0} {...props} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ConfirmButton', () => {
  it('asks again before acting, and backs out on cancel or after a pause', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onConfirm = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(
      <ConfirmButton confirmLabel="Really delete" onConfirm={onConfirm}>
        Delete
      </ConfirmButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Really delete' })).toHaveFocus()
    act(() => vi.advanceTimersByTime(4500))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
