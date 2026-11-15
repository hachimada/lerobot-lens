import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { session } from '../../test/fixtures'
import { CameraGrid } from './CameraGrid'
import { EpisodeBrowser } from './EpisodeBrowser'
import { JointCharts } from './JointCharts'
import type { ProbeView } from './probes'
import { toChunk, toProbeView } from './probes'
import { ShortcutsDialog } from './ShortcutsDialog'
import { RecordingTimeline } from './RecordingTimeline'
import { TopBar } from './TopBar'
import { TransportBar } from './TransportBar'

afterEach(() => vi.unstubAllGlobals())

function probeView(id: string, startFrame: number, predicted: number[][]): ProbeView {
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
        predicted_actions: predicted,
        ground_truth_actions: predicted.map((row) => row.map((value) => value - 1)),
        chunk_size: predicted.length,
      },
    }),
    [10, 10],
  )
}

/** jsdom has no layout; give pointer targets a 100px-wide box at x = 0. */
function stubBounds(element: Element) {
  element.getBoundingClientRect = () =>
    ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }) as DOMRect
}

describe('EpisodeBrowser', () => {
  const episodes = [
    { index: 0, length: 10, duration: 1, task: 'pick cube' },
    { index: 12, length: 20, duration: 2, task: 'place cube' },
  ]

  it('filters, marks the selection and probe summaries, and selects episodes', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <EpisodeBrowser
        episodes={episodes}
        selectedIndex={12}
        summaries={new Map([[12, { count: 3, level: 'poor' }]])}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: /#012/ })).toHaveAttribute('aria-current', 'true')
    // Clicking an episode leaves focus where it was, so Space still plays.
    expect(screen.getByTitle('3 probes')).toHaveTextContent('3')
    expect(screen.getByText('place cube')).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Filter episodes' }), 'pick')
    expect(screen.queryByRole('button', { name: /#012/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /#000/ }))
    expect(onSelect).toHaveBeenCalledWith(0)

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText('No matching episodes')).toBeInTheDocument()
  })

  it('shows a task shared by every episode once, in the header', () => {
    render(
      <EpisodeBrowser
        episodes={episodes.map((episode) => ({ ...episode, task: 'same task' }))}
        selectedIndex={0}
        summaries={new Map([[0, { count: 1, level: 'good' }]])}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getAllByText('same task')).toHaveLength(1)
    expect(screen.getByTitle('1 probe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Episode number')).toBeInTheDocument()
  })
})

describe('CameraGrid', () => {
  it('shows every camera, enlarges one, and lays out by aspect ratio', async () => {
    let resize: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null =
      null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: typeof resize) {
          resize = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const user = userEvent.setup()
    render(
      <CameraGrid
        images={{ 'observation.images.top': 'data:top', 'observation.images.wrist': 'data:wrist' }}
        timestamp={1.5}
        loading={false}
      />,
    )
    expect(screen.getByAltText('top camera')).toBeInTheDocument()
    expect(screen.getByAltText('wrist camera')).toBeInTheDocument()
    expect(screen.getAllByText('1.50s')).toHaveLength(2)

    const grid = screen.getByAltText('top camera').closest('figure')!.parentElement as HTMLElement
    fireEvent.load(screen.getByAltText('top camera'))
    resize!([{ contentRect: { width: 400, height: 600 } }])
    await screen.findByAltText('top camera')
    expect(grid.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))')

    await user.click(screen.getByRole('button', { name: 'Enlarge wrist camera' }))
    expect(screen.queryByAltText('top camera')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all cameras' }))
    expect(screen.getByAltText('top camera')).toBeInTheDocument()
  })

  it('reports decoding and missing cameras', () => {
    const { rerender } = render(<CameraGrid images={{}} timestamp={0} loading />)
    expect(screen.getByText('Decoding frame…')).toBeInTheDocument()
    rerender(<CameraGrid images={{}} timestamp={0} loading={false} />)
    expect(screen.getByText('No camera observations')).toBeInTheDocument()
    rerender(<CameraGrid images={{ front: 'data:x' }} timestamp={0} loading={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    rerender(
      <CameraGrid
        images={{ front: 'data:x' }}
        timestamp={0}
        loading={false}
        note="Policy input · frame 3"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Policy input · frame 3')
  })
})

describe('RecordingTimeline', () => {
  it('exposes the recording position as a slider and seeks while dragging', () => {
    const onSeek = vi.fn()
    render(<RecordingTimeline frame={5} frameCount={11} fps={10} onSeek={onSeek} />)
    const slider = screen.getByRole('slider', { name: 'Recording timeline' })
    expect(slider).toHaveAttribute('aria-valuenow', '5')
    expect(slider).toHaveAttribute('aria-valuetext', 'Frame 5, 0:00.50')

    stubBounds(slider)
    fireEvent.pointerDown(slider, { button: 0, buttons: 1, clientX: 30, pointerId: 1 })
    fireEvent.pointerMove(slider, { buttons: 1, clientX: 80 })
    fireEvent.pointerMove(slider, { buttons: 0, clientX: 90 })
    fireEvent.pointerDown(slider, { button: 2, clientX: 10 })
    expect(onSeek.mock.calls).toEqual([[3], [8]])
  })
})

describe('JointCharts', () => {
  const recorded = [
    [0, 10],
    [1, 11],
    [2, 12],
    [3, 13],
  ]

  it('draws one chart per joint with recorded and predicted values at the playhead', () => {
    const onSeek = vi.fn()
    const focus = probeView('focus', 1, [
      [1.5, 11.5],
      [2.5, 12.5],
    ])
    render(
      <JointCharts
        actionNames={['shoulder.pos']}
        recorded={recorded}
        probes={[focus, probeView('other', 3, [[3, 13]])]}
        focus={focus}
        focusStep={1}
        frame={2}
        frameCount={4}
        onSeek={onSeek}
      />,
    )
    expect(screen.getByRole('img', { name: /shoulder: recorded/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /joint 2: recorded/ })).toBeInTheDocument()
    expect(screen.getByText('2.50')).toBeInTheDocument()
    // Recorded, predicted, and their difference all describe the frame under the playhead.
    expect(screen.getByText('Difference')).toBeInTheDocument()
    expect(screen.getAllByText('+1.00')).toHaveLength(2)

    const plot = screen.getByRole('img', { name: /shoulder: recorded/ }).parentElement!
    stubBounds(plot)
    fireEvent.pointerDown(plot, { button: 0, buttons: 1, clientX: 100, pointerId: 1 })
    expect(onSeek).toHaveBeenCalledWith(3)
  })

  it('leaves prediction columns empty while the stage shows the recording', () => {
    const focus = probeView('focus', 0, [[0.5, 10.5]])
    render(
      <JointCharts
        actionNames={['shoulder', 'elbow']}
        recorded={recorded}
        probes={[focus]}
        focus={focus}
        focusStep={null}
        frame={0}
        frameCount={4}
        onSeek={vi.fn()}
      />,
    )
    expect(screen.getByText('0.00')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(4)
  })

  it('shows loading and empty states', () => {
    const props = {
      actionNames: [],
      probes: [],
      focus: null,
      focusStep: null,
      frame: 0,
      frameCount: 1,
      onSeek: vi.fn(),
    }
    const { rerender } = render(<JointCharts {...props} recorded={null} />)
    expect(screen.getByText('Loading recorded actions…')).toBeInTheDocument()
    rerender(<JointCharts {...props} recorded={[]} />)
    expect(screen.getByText('This episode has no recorded actions.')).toBeInTheDocument()
  })
})

describe('TransportBar', () => {
  it('controls episode playback and speed', async () => {
    const handlers = { onToggle: vi.fn(), onStep: vi.fn(), onSpeed: vi.fn() }
    const user = userEvent.setup()
    const { rerender } = render(
      <TransportBar frame={30} frameCount={61} fps={30} playing={false} speed={1} {...handlers} />,
    )
    expect(screen.getByText('Frame 30 / 60')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('title', 'Play (Space)')
    await user.click(screen.getByRole('button', { name: 'Play' }))
    await user.click(screen.getByRole('button', { name: 'Previous frame' }))
    await user.click(screen.getByRole('button', { name: 'Next frame' }))
    await user.click(screen.getByRole('button', { name: '2×' }))
    expect(handlers.onToggle).toHaveBeenCalled()
    expect(handlers.onStep.mock.calls).toEqual([[-1], [1]])
    expect(handlers.onSpeed).toHaveBeenCalledWith(2)
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true')

    rerender(
      <TransportBar frame={0} frameCount={1} fps={30} playing speed={1} {...handlers}>
        <div data-testid="timeline" />
      </TransportBar>,
    )
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    // The timeline sits in the same row as the controls.
    expect(screen.getByTestId('timeline')).toBeInTheDocument()
  })
})

describe('TopBar and shortcuts', () => {
  it('summarizes the session and exposes workspace actions', async () => {
    const handlers = {
      onToggleTheme: vi.fn(),
      onHome: vi.fn(),
      onEditSession: vi.fn(),
      onShowShortcuts: vi.fn(),
      onToggleSidebar: vi.fn(),
    }
    const user = userEvent.setup()
    const { rerender } = render(
      <TopBar
        session={{ ...session, policy: '/o/act/checkpoints/030000/pretrained_model' }}
        theme="dark"
        {...handlers}
      />,
    )
    expect(screen.getByText('org/data')).toBeInTheDocument()
    expect(screen.getByText('@030000')).toBeInTheDocument()
    for (const name of [
      'Toggle episode list',
      'Close session and return to setup',
      'Keyboard shortcuts',
      'Switch to light theme',
    ]) {
      await user.click(screen.getByRole('button', { name }))
    }
    await user.click(screen.getByRole('button', { name: /Change/ }))
    expect(handlers.onToggleSidebar).toHaveBeenCalled()
    expect(handlers.onHome).toHaveBeenCalled()
    expect(handlers.onShowShortcuts).toHaveBeenCalled()
    expect(handlers.onToggleTheme).toHaveBeenCalled()
    expect(handlers.onEditSession).toHaveBeenCalled()

    rerender(
      <TopBar session={{ ...session, policy: null }} theme="light" onToggleTheme={vi.fn()} />,
    )
    expect(screen.getByText('No policy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LeRobot Lens' })).toBeDisabled()

    rerender(<TopBar session={{ ...session, demo: true }} theme="light" onToggleTheme={vi.fn()} />)
    expect(screen.getByText('Demo policy')).toBeInTheDocument()
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('lists keyboard shortcuts in a dialog', () => {
    const onClose = vi.fn()
    render(<ShortcutsDialog onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(screen.getByText('Probe the policy at this frame')).toBeInTheDocument()
    // Each row shows the keys of its actions, as the parser reads them.
    expect(screen.getByText('Jump 10 frames or steps').parentElement).toHaveTextContent(
      'Shift+←Shift+→',
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
