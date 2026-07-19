import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
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
    urdfUrl: vi.fn((id: string) => `/api/sessions/${id}/urdf`),
  },
}))

const mockedApi = vi.mocked(api)
const componentState = vi.hoisted(() => ({
  robotViewer: vi.fn(),
}))

vi.mock('../features/evaluation/components/RobotViewer', () => ({
  RobotViewer: (props: { mode: string; values: number[]; jointNames: string[] }) => {
    componentState.robotViewer(props)
    return <div data-testid="robot-viewer">{props.mode}</div>
  },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

async function openDemo(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))
  await screen.findByText('org/data')
  return user
}

beforeEach(() => {
  componentState.robotViewer.mockClear()
  mockedApi.getRobots.mockResolvedValue([])
  mockedApi.createSession.mockResolvedValue(session)
  mockedApi.getSession.mockResolvedValue(session)
  mockedApi.getEpisodes.mockResolvedValue([{ index: 0, length: 2, duration: 1 / 30, task: 'pick' }])
  mockedApi.getEpisodeActions.mockResolvedValue({
    episode: 0,
    fps: 30,
    action_names: ['shoulder', 'elbow'],
    actions: [
      [1, 2],
      [1.1, 2.1],
    ],
  })
  mockedApi.getFrame.mockResolvedValue(frame)
  mockedApi.infer.mockResolvedValue(inference)
})

afterEach(() => vi.useRealTimers())

describe('App', () => {
  it('loads a workspace only after installing its episode state', async () => {
    const nextEpisodes =
      deferred<{ index: number; length: number; duration: number; task: string }[]>()
    mockedApi.createSession
      .mockResolvedValueOnce({ ...session, id: 'old-session' })
      .mockResolvedValueOnce({ ...session, id: 'new-session' })
    mockedApi.getEpisodes
      .mockResolvedValueOnce([
        { index: 7, length: 2, duration: 1 / 30, task: 'old-first' },
        { index: 8, length: 2, duration: 1 / 30, task: 'old-selected' },
      ])
      .mockReturnValueOnce(nextEpisodes.promise)
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    await user.selectOptions(
      screen.getByRole('option', { name: '#008 — old-selected' }).parentElement!,
      '8',
    )
    await waitFor(() =>
      expect(mockedApi.getFrame).toHaveBeenCalledWith('old-session', 8, 0, expect.any(AbortSignal)),
    )

    await user.click(screen.getByRole('button', { name: 'LeRobot Lens' }))
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    await waitFor(() => expect(mockedApi.createSession).toHaveBeenCalledTimes(2))
    expect(mockedApi.getFrame).not.toHaveBeenCalledWith(
      'new-session',
      8,
      expect.any(Number),
      expect.any(AbortSignal),
    )

    nextEpisodes.resolve([{ index: 3, length: 2, duration: 1 / 30, task: 'new' }])

    await waitFor(() =>
      expect(mockedApi.getFrame).toHaveBeenCalledWith('new-session', 3, 0, expect.any(AbortSignal)),
    )
    expect(
      mockedApi.getFrame.mock.calls
        .filter(([sessionId]) => sessionId === 'new-session')
        .map(([, episode]) => episode),
    ).toEqual([3])
    expect(mockedApi.getEpisodeActions).toHaveBeenCalledWith(
      'new-session',
      3,
      expect.any(AbortSignal),
    )
  })

  it('runs inference from the selected observation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    await user.click(await screen.findByRole('button', { name: /Infer action chunk/ }))
    await waitFor(() => expect(mockedApi.infer).toHaveBeenCalledWith('session', 0, 0))
    expect(await screen.findByText('2 actions')).toBeInTheDocument()
  })

  it('returns to setup with a useful error when the dataset has no episodes', async () => {
    mockedApi.getEpisodes.mockResolvedValue([])
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    expect(await screen.findByText('The dataset contains no episodes.')).toBeInTheDocument()
  })

  it('polls a loading session until it becomes ready', async () => {
    vi.useFakeTimers()
    mockedApi.createSession.mockResolvedValue({ ...session, status: 'loading' })
    mockedApi.getSession.mockResolvedValue(session)
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    await act(async () => Promise.resolve())
    expect(screen.getByRole('button', { name: /Loading artifacts/ })).toBeDisabled()
    await act(async () => vi.advanceTimersByTimeAsync(750))

    expect(mockedApi.getSession).toHaveBeenCalledWith('session')
    expect(screen.getByText('org/data')).toBeInTheDocument()
  })

  it('returns to setup when a polled session reports a background error', async () => {
    vi.useFakeTimers()
    mockedApi.createSession.mockResolvedValue({ ...session, status: 'loading' })
    mockedApi.getSession.mockResolvedValue({
      ...session,
      status: 'error',
      message: 'policy load failed',
    })
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    await act(async () => Promise.resolve())
    await act(async () => vi.advanceTimersByTimeAsync(750))

    expect(screen.getByText('policy load failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Load workspace/ })).toBeInTheDocument()
  })

  it.each([
    [
      'session creation',
      () => mockedApi.createSession.mockRejectedValue(new Error('create failed')),
    ],
    [
      'episode listing',
      () => mockedApi.getEpisodes.mockRejectedValue(new Error('episodes failed')),
    ],
  ])('shows %s failures on the setup screen', async (_label, arrange) => {
    arrange()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Explore with demo data' }))
    expect(await screen.findByText(/(create|episodes) failed/)).toBeInTheDocument()
  })

  it('shows loading, frame, action, and inference failures without losing the workspace', async () => {
    mockedApi.getFrame.mockRejectedValueOnce(new Error('frame failed'))
    mockedApi.getEpisodeActions.mockRejectedValueOnce(new Error('actions failed'))
    mockedApi.infer.mockRejectedValueOnce(new Error('infer failed'))
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)

    expect(await screen.findByText(/(frame|actions) failed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Infer action chunk/ }))
    expect(await screen.findByText('infer failed')).toBeInTheDocument()
    expect(screen.getByText('org/data')).toBeInTheDocument()
  })

  it('ignores aborted frame and action responses after an episode switch', async () => {
    const oldFrame = deferred<typeof frame>()
    const oldActions = deferred<{
      episode: number
      fps: number
      action_names: string[]
      actions: number[][]
    }>()
    mockedApi.getEpisodes.mockResolvedValue([
      { index: 0, length: 2, duration: 1 / 30, task: 'pick' },
      { index: 1, length: 2, duration: 1 / 30, task: 'place' },
    ])
    mockedApi.getFrame.mockImplementation((_id, episode) =>
      episode === 0
        ? oldFrame.promise
        : Promise.resolve({ ...frame, episode: 1, timestamp: 2.5, images: {} }),
    )
    mockedApi.getEpisodeActions.mockImplementation((_id, episode) =>
      episode === 0
        ? oldActions.promise
        : Promise.resolve({ episode: 1, fps: 30, action_names: ['shoulder'], actions: [[9]] }),
    )
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    await waitFor(() => expect(mockedApi.getFrame).toHaveBeenCalled())
    const oldFrameSignal = mockedApi.getFrame.mock.calls[0][3]
    const oldActionsSignal = mockedApi.getEpisodeActions.mock.calls[0][2]
    if (!oldFrameSignal || !oldActionsSignal) throw new Error('Expected abort signals')

    await user.selectOptions(
      screen.getByRole('option', { name: '#001 — place' }).parentElement!,
      '1',
    )
    expect(await screen.findByText('2.500 s')).toBeInTheDocument()
    oldFrame.resolve({ ...frame, episode: 0, timestamp: 9.9 })
    oldActions.resolve({ episode: 0, fps: 30, action_names: ['old'], actions: [[99]] })

    await waitFor(() => {
      expect(oldFrameSignal.aborted).toBe(true)
      expect(oldActionsSignal.aborted).toBe(true)
    })
    expect(screen.queryByText('9.900 s')).not.toBeInTheDocument()
  })

  it('plays the episode at the selected speed and stops at the final frame', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    await user.click(screen.getByRole('button', { name: '2×' }))
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    await act(async () => vi.advanceTimersByTimeAsync(20))
    expect(mockedApi.getFrame).toHaveBeenCalledWith('session', 0, 1, expect.any(AbortSignal))
    await act(async () => vi.advanceTimersByTimeAsync(20))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('plays, clears, and resets inference when the timeline changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: /Infer action chunk/ }))
    await act(async () => Promise.resolve())
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    await act(async () => vi.advanceTimersByTimeAsync(70))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Replay/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('slider', { name: 'Episode timeline' }), {
      target: { value: '1' },
    })
    expect(screen.getByText('No inference yet')).toBeInTheDocument()
  })

  it('switches cameras and passes dataset and inference motion to the URDF viewer', async () => {
    mockedApi.createSession.mockResolvedValue({
      ...session,
      has_urdf: true,
      dataset_angle_unit: 'degrees',
    })
    mockedApi.getFrame.mockResolvedValue({
      ...frame,
      images: {
        'observation.images.front': 'data:image/jpeg;base64,ZnJvbnQ=',
        'observation.images.wrist': 'data:image/jpeg;base64,d3Jpc3Q=',
      },
    })
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    await waitFor(() => expect(componentState.robotViewer).toHaveBeenCalled())
    expect(componentState.robotViewer.mock.lastCall?.[0]).toMatchObject({
      mode: 'dataset',
      values: [1, 2],
      jointNames: ['shoulder', 'elbow'],
    })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Camera stream' }),
      'observation.images.wrist',
    )
    expect(screen.getByAltText('observation.images.wrist observation')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,d3Jpc3Q=',
    )
    await user.click(screen.getByRole('button', { name: /Infer action chunk/ }))
    await waitFor(() =>
      expect(componentState.robotViewer.mock.lastCall?.[0]).toMatchObject({
        mode: 'inference',
        values: [1.02, 2.2],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Clear inference' }))
    expect(screen.getByText('No inference yet')).toBeInTheDocument()
  })

  it('closes the workspace and returns to setup', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openDemo(user)
    await user.click(screen.getByRole('button', { name: 'LeRobot Lens' }))
    expect(screen.getByRole('button', { name: /Load workspace/ })).toBeInTheDocument()
  })
})
