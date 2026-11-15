import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { SessionSummary } from '../shared/api/types'
import { frame, inference, session } from '../test/fixtures'
import App from './App'

vi.mock('../shared/api/client', () => ({
  api: {
    getRobots: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    getEpisodes: vi.fn(),
    getEpisodeActions: vi.fn(),
    getFrame: vi.fn(),
    infer: vi.fn(),
    urdfUrl: (id: string) => `/api/sessions/${id}/urdf`,
    assetsUrl: (id: string) => `http://host/api/sessions/${id}/assets`,
  },
}))

const viewer = vi.hoisted(() => ({ props: [] as { pose: unknown; ghost: unknown }[] }))
vi.mock('../features/workspace/RobotViewer', () => ({
  RobotViewer: (props: { pose: unknown; ghost: unknown }) => {
    viewer.props.push(props)
    return <div data-testid="robot-viewer" />
  },
}))

const mocked = vi.mocked(api)
const episodes = [
  { index: 0, length: 4, duration: 0.13, task: 'pick' },
  { index: 1, length: 4, duration: 0.13, task: 'place' },
]
const actions = (episode: number) => ({
  episode,
  fps: 30,
  action_names: ['shoulder', 'elbow'],
  actions: [
    [1, 2],
    [1.1, 2.1],
    [1.2, 2.2],
    [1.3, 2.3],
  ],
})

function useSession(summary: Partial<SessionSummary> = {}) {
  const value = { ...session, ...summary }
  mocked.createSession.mockResolvedValue(value)
  mocked.getSession.mockResolvedValue(value)
}

beforeEach(() => {
  window.localStorage.clear()
  viewer.props = []
  mocked.getRobots.mockResolvedValue([])
  useSession()
  mocked.getEpisodes.mockResolvedValue(episodes)
  mocked.getEpisodeActions.mockImplementation(async (_id, episode) => actions(episode))
  mocked.getFrame.mockImplementation(async (_id, episode, index) => ({
    ...frame,
    episode,
    frame: index,
  }))
  mocked.infer.mockImplementation(async (_id, episode, start) => ({
    ...inference,
    episode,
    start_frame: start,
  }))
})

async function openDemo() {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: /Try the demo/ }))
  await screen.findByRole('heading', { level: 1, name: /^Episode/ })
  return user
}

describe('App', () => {
  it('opens the demo and probes the policy from the keyboard', async () => {
    useSession({ demo: true, policy: null, has_urdf: true, dataset_angle_unit: 'degrees' })
    const user = await openDemo()
    expect(mocked.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ demo: true }),
      expect.anything(),
    )
    expect(await screen.findByAltText('front camera')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /shoulder: recorded/ })).toBeInTheDocument()
    expect(screen.getByText('Observed state')).toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(mocked.getFrame).toHaveBeenLastCalledWith('session', 0, 1, expect.anything()),
    )
    await user.keyboard('i')
    expect(await screen.findByRole('region', { name: 'Selected probe' })).toHaveTextContent(
      'Frames 1–2',
    )
    expect(mocked.infer).toHaveBeenCalledWith('session', 0, 1, expect.anything())
    // A new probe replays right away, comparing predicted with recorded actions.
    expect(screen.getByRole('group', { name: 'Chunk player' })).toBeInTheDocument()
    expect(screen.getByText(/Predicted action · step \d\/2/)).toBeInTheDocument()
    expect(viewer.props.at(-1)?.ghost).not.toBeNull()
    expect(screen.getByTitle('1 probe')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.getByText('Observed state')).toBeInTheDocument()
    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByText('Frame 3 / 3')).toBeInTheDocument())
    await user.keyboard('r')
    expect(await screen.findByText(/Predicted action/)).toBeInTheDocument()
    // The recording keeps its position while the stage shows the probe.
    expect(screen.getByText('Frame 3 / 3')).toBeInTheDocument()
    expect(screen.getByText('Policy input · frame 1')).toBeInTheDocument()
  })

  it('scans an episode, selects probes, and keeps them per episode', async () => {
    const user = await openDemo()
    // Back-to-back 2-step chunks over the 4-frame episode: probes at frames 0 and 2.
    expect(await screen.findByText('· 2 chunks, every 2 frames')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Probe whole episode/ }))
    await waitFor(() =>
      expect(mocked.infer).toHaveBeenCalledWith('session', 0, 2, expect.anything()),
    )
    const list = await screen.findByRole('region', { name: /Probes in this episode/ })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))
    expect(screen.getByText(/select a chunk above/)).toBeInTheDocument()

    // Opening a probe from the details list keeps the recording where it was.
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await user.click(within(list).getByRole('button', { name: /0–1/ }))
    expect(screen.getByText('Policy input · frame 0')).toBeInTheDocument()
    expect(screen.getByText('Frame 3 / 3')).toBeInTheDocument()
    const stage = screen.getByRole('group', { name: 'Stage shows' })
    expect(within(stage).getByRole('button', { name: /Probe 0–1 · step 1\/2/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The probe track picks the other chunk; the stage switch returns to the recording.
    const track = screen.getByRole('group', { name: 'Probe chunks' })
    // Clicked buttons do not take focus, so Space keeps driving playback.
    expect(fireEvent.mouseDown(within(track).getByRole('button', { name: /^Probe 2–3/ }))).toBe(
      false,
    )
    await user.click(within(track).getByRole('button', { name: /^Probe 2–3/ }))
    expect(screen.getByText('Policy input · frame 2')).toBeInTheDocument()
    await user.click(within(stage).getByRole('button', { name: /Recording/ }))
    expect(screen.queryByText(/Policy input/)).not.toBeInTheDocument()
    expect(within(track).getByRole('button', { name: /^Probe 2–3/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.keyboard(']')
    expect(await screen.findByRole('heading', { name: /#001/ })).toBeInTheDocument()
    expect(screen.getByText('No probe selected')).toBeInTheDocument()
    await user.keyboard('[[')
    expect(await screen.findByRole('heading', { name: /#000/ })).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: /Probes in this episode/ })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /Clear all probes/ }))
    await user.click(screen.getByRole('button', { name: 'Clear 2 probes' }))
    expect(screen.getByText(/Probes appear here and on the probe track/)).toBeInTheDocument()
    expect(screen.getByText('Or check a single frame:')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Probe chunks' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /#001/ }))
    expect(await screen.findByRole('heading', { name: /#001/ })).toBeInTheDocument()

    // The toolbar's probe button runs the policy on the recording frame.
    await user.click(screen.getByRole('button', { name: /Probe frame 0/ }))
    expect(await screen.findByRole('group', { name: 'Chunk player' })).toBeInTheDocument()
    await user.keyboard('{Escape}{ArrowRight}')
    await user.click(screen.getByRole('button', { name: /Probe frame 1/ }))
    await waitFor(() =>
      expect(mocked.infer).toHaveBeenLastCalledWith('session', 1, 1, expect.anything()),
    )
  })

  it('remembers opened sessions and reopens them from the setup screen', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByRole('combobox', { name: /^Dataset/ }), 'org/data')
    await user.type(screen.getByRole('combobox', { name: /^Policy/ }), 'org/policy')
    await user.click(screen.getByRole('button', { name: /Open workspace/ }))
    await screen.findByRole('heading', { level: 1, name: /^Episode/ })

    await user.click(screen.getByRole('button', { name: 'Close session and return to setup' }))
    const recents = await screen.findByRole('region', { name: 'Recent' })
    await user.click(within(recents).getByText('org/data'))
    await screen.findByRole('heading', { level: 1, name: /^Episode/ })
    expect(mocked.createSession).toHaveBeenCalledTimes(2)
  })

  it('changes the session from a dialog and reports failures there', async () => {
    const user = await openDemo()
    await user.click(screen.getByRole('button', { name: /Change/ }))
    const dialog = screen.getByRole('dialog', { name: 'Change session' })

    // Workspace shortcuts pause while the dialog is open.
    await user.keyboard('?')
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()

    mocked.createSession.mockResolvedValueOnce({
      ...session,
      status: 'error',
      message: 'Not found',
    })
    const datasetField = within(dialog).getByRole('combobox', { name: /^Dataset/ })
    await user.clear(datasetField)
    await user.type(datasetField, 'org/other')
    await user.click(within(dialog).getByRole('button', { name: /Open session/ }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not found')

    await user.click(within(dialog).getByRole('button', { name: /Open session/ }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Change session' })).not.toBeInTheDocument(),
    )
  })

  it('shows shortcuts, toggles the theme and sidebar, and guards browse-only sessions', async () => {
    useSession({ policy: null })
    const user = await openDemo()
    await user.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }))
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))

    const theme = document.documentElement.dataset.theme
    await user.click(screen.getByRole('button', { name: /Switch to (light|dark) theme/ }))
    expect(document.documentElement.dataset.theme).not.toBe(theme)

    await user.click(screen.getByRole('button', { name: 'Toggle episode list' }))
    expect(screen.queryByRole('navigation', { name: 'Episodes' })).not.toBeInTheDocument()

    expect(screen.getByText('Browse-only session')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Probe frame/ })).not.toBeInTheDocument()
    await user.keyboard('i')
    expect(mocked.infer).not.toHaveBeenCalled()

    await user.keyboard(' ')
    await user.keyboard(' ')
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}{ArrowLeft}{Home}[[')
    expect(screen.getByText('Frame 0 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Add a policy/ }))
    expect(screen.getByRole('dialog', { name: 'Change session' })).toBeInTheDocument()
  })

  it('surfaces frame errors and session load cancellation on the setup screen', async () => {
    mocked.getFrame.mockRejectedValue(new Error('decode failed'))
    await openDemo()
    expect(await screen.findByText('decode failed')).toBeInTheDocument()
  })

  it('lets a slow session load be cancelled', async () => {
    mocked.createSession.mockResolvedValue({
      ...session,
      status: 'loading',
      message: 'Loading policy…',
    })
    mocked.getSession.mockResolvedValue({
      ...session,
      status: 'loading',
      message: 'Loading policy…',
    })
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Try the demo/ }))
    expect(await screen.findByRole('status')).toHaveTextContent('Opening session')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open workspace/ })).toBeEnabled()
    act(() => fireEvent.keyDown(window, { key: 'i' }))
  })

  it('replays a chunk against recorded actions while the camera holds the policy input', async () => {
    const trajectory = Array.from({ length: 30 }, (_, frame) => [frame, frame * 2])
    useSession({ demo: true, has_urdf: true, dataset_angle_unit: 'degrees' })
    mocked.getEpisodes.mockResolvedValue([{ index: 0, length: 30, duration: 1, task: 'pick' }])
    mocked.getEpisodeActions.mockResolvedValue({
      episode: 0,
      fps: 30,
      action_names: ['shoulder', 'elbow'],
      actions: trajectory,
    })
    mocked.infer.mockImplementation(async (_id, episode, start) => ({
      ...inference,
      episode,
      start_frame: start,
      chunk_size: 5,
      predicted_actions: trajectory.slice(start, start + 5).map(([a, b]) => [a + 0.5, b]),
      ground_truth_actions: trajectory.slice(start, start + 5),
    }))
    const user = await openDemo()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await waitFor(() => expect(screen.getByText('Frame 10 / 29')).toBeInTheDocument())
    await user.keyboard('i')

    const player = await screen.findByRole('group', { name: 'Chunk player' })
    expect(screen.getByText('Policy input · frame 10')).toBeInTheDocument()
    // The replay runs to its last step without moving the camera off frame 10.
    await waitFor(() => expect(player).toHaveTextContent('Step 5 / 5'))
    expect(mocked.getFrame).not.toHaveBeenCalledWith('session', 0, 11, expect.anything())
    expect(screen.getByText('Frame 10 / 29')).toBeInTheDocument()

    // Playback keys move through the chunk: predicted and recorded actions of one step.
    await user.keyboard('{Home}{ArrowRight}')
    expect(player).toHaveTextContent('Step 2 / 5')
    expect(viewer.props.at(-1)).toMatchObject({
      pose: { values: [11.5, 22] },
      ghost: { values: [11, 22] },
    })
    await user.keyboard(' ')
    await waitFor(() => expect(player).toHaveTextContent('Step 5 / 5'))
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}{End}')
    expect(player).toHaveTextContent('Step 5 / 5')

    // Leaving the replay returns to the recording; the probe stays selected.
    await user.keyboard('{Escape}')
    expect(screen.getByText('Observed state')).toBeInTheDocument()
    expect(screen.queryByText(/Policy input/)).not.toBeInTheDocument()
    expect(player).toHaveTextContent('Step 1 / 5')

    // Each timeline has its own controls: the recording moves on its own, the chunk
    // player puts the probe back on the stage, and the recording transport leaves it.
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByText('Frame 11 / 29')).toBeInTheDocument())
    await user.click(within(player).getByRole('button', { name: 'Play chunk' }))
    expect(screen.getByText('Policy input · frame 10')).toBeInTheDocument()
    await user.click(within(player).getByRole('button', { name: 'Pause chunk' }))
    expect(screen.getByText('Frame 11 / 29')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next frame' }))
    await waitFor(() => expect(screen.getByText('Frame 12 / 29')).toBeInTheDocument())
    expect(screen.getByText('Observed state')).toBeInTheDocument()

    // Scrubbing the chunk step opens the probe at that step.
    fireEvent.change(within(player).getByRole('slider', { name: 'Chunk step' }), {
      target: { value: '3' },
    })
    expect(player).toHaveTextContent('Step 4 / 5')
    expect(screen.getByText('Predicted action · step 4/5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Recording/ }))
    expect(screen.getByText('Observed state')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Probe 10–14 · step/ }))
    expect(screen.getByText('Predicted action · step 1/5')).toBeInTheDocument()

    // Delete removes the selected probe; the chunk player clears the rest after confirming.
    await user.keyboard('{Delete}')
    expect(screen.queryByRole('group', { name: 'Chunk player' })).not.toBeInTheDocument()
    expect(screen.getByText('Observed state')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Probe$/ })).toBeDisabled()
    await user.keyboard('i')
    await screen.findByRole('group', { name: 'Chunk player' })
    expect(screen.getByText('Policy input · frame 12')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Clear all probes/ }))
    await user.click(screen.getByRole('button', { name: 'Clear 1 probe' }))
    expect(screen.queryByRole('button', { name: /Clear all probes/ })).not.toBeInTheDocument()
    expect(screen.getByText('Or check a single frame:')).toBeInTheDocument()
    expect(screen.getByText('Observed state')).toBeInTheDocument()
  })

  it('plays the chunks through the episode from the latest observation, jumping gaps', async () => {
    const trajectory = Array.from({ length: 30 }, (_, frame) => [frame, frame * 2])
    useSession({ demo: true, has_urdf: true, dataset_angle_unit: 'degrees', action_chunk_size: 5 })
    mocked.getEpisodes.mockResolvedValue([{ index: 0, length: 30, duration: 1, task: 'pick' }])
    mocked.getEpisodeActions.mockResolvedValue({
      episode: 0,
      fps: 30,
      action_names: ['shoulder', 'elbow'],
      actions: trajectory,
    })
    mocked.infer.mockImplementation(async (_id, episode, start) => ({
      ...inference,
      episode,
      start_frame: start,
      chunk_size: 5,
      // Each prediction carries its chunk's start in the hundredths.
      predicted_actions: trajectory
        .slice(start, start + 5)
        .map(([a, b]) => [a + 0.5 + start / 100, b]),
      ground_truth_actions: trajectory.slice(start, start + 5),
    }))
    const user = await openDemo()
    async function probeAt(frame: number) {
      await waitFor(() => expect(screen.getByText(`Frame ${frame} / 29`)).toBeInTheDocument())
      await user.keyboard('i')
      expect(await screen.findByText(`Policy input · frame ${frame}`)).toBeInTheDocument()
      await user.keyboard('{Escape}')
    }
    // Chunks 0–4 and 3–7 overlap; 23–27 comes after a gap.
    await probeAt(0)
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await probeAt(3)
    await user.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}')
    await probeAt(23)

    viewer.props = []
    const playAll = screen.getByRole('button', { name: /Play all chunks/ })
    await user.click(playAll)
    expect(playAll).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(playAll).toHaveAttribute('aria-pressed', 'false'), {
      timeout: 3000,
    })
    // Which chunk each frame came from: 0–4 until 3–7 starts at frame 3, then 3–7 to its
    // end, then 23–27 after the gap.
    const shown = viewer.props
      .filter((props) => props.ghost)
      .map((props) => {
        const value = (props.pose as { values: number[] }).values[0] - 0.5
        const frame = Math.floor(value + 1e-6)
        return `${Math.round((value - frame) * 100)}:${frame}`
      })
    expect([...new Set(shown)]).toEqual([
      '0:0',
      '0:1',
      '0:2',
      '3:3',
      '3:4',
      '3:5',
      '3:6',
      '3:7',
      '23:23',
      '23:24',
      '23:25',
      '23:26',
      '23:27',
    ])
    expect(screen.getByText('Policy input · frame 23')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Selected probe' })).toHaveTextContent('Frames 23–27')
    expect(screen.getByRole('group', { name: 'Chunk player' })).toHaveTextContent(
      'Step 5 / 5 · frame 27',
    )

    // After the last chunk, it starts over; the chunk's own button plays that chunk alone.
    await user.click(playAll)
    expect(screen.getByText('Policy input · frame 0')).toBeInTheDocument()
    await user.click(playAll)
    expect(playAll).toHaveAttribute('aria-pressed', 'false')
    // Chunk 0–4 alone plays past frame 3, where playing all chunks would have moved on.
    await user.click(screen.getByRole('button', { name: 'Play chunk' }))
    const player = screen.getByRole('group', { name: 'Chunk player' })
    await waitFor(() => expect(player).toHaveTextContent('Step 5 / 5 · frame 4'))
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 150)))
    expect(screen.getByText('Policy input · frame 0')).toBeInTheDocument()

    // Space pauses and resumes playing all chunks, on from the chunk on the stage.
    await user.click(playAll)
    await waitFor(() => expect(screen.getByText('Policy input · frame 3')).toBeInTheDocument())
    act(() => playAll.blur())
    await user.keyboard(' ')
    expect(playAll).toHaveAttribute('aria-pressed', 'false')
    await user.keyboard(' ')
    await waitFor(() => expect(screen.getByText('Policy input · frame 23')).toBeInTheDocument(), {
      timeout: 3000,
    })
  })
})
