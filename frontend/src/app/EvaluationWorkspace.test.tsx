import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '../shared/api/client'
import type { SessionCreate } from '../shared/api/types'
import { frame, inference, session } from '../test/fixtures'
import { EvaluationWorkspace } from './EvaluationWorkspace'

vi.mock('../shared/api/client', () => ({
  api: { getRobots: vi.fn() },
}))

const componentState = vi.hoisted(() => ({
  robotViewer: vi.fn(),
}))

vi.mock('../features/evaluation/components/RobotViewer', () => ({
  RobotViewer: (props: { url: string; mode: string; values: number[]; jointNames: string[] }) => {
    componentState.robotViewer(props)
    return <div data-testid="robot-viewer">{props.mode}</div>
  },
}))

const mockedApi = vi.mocked(api)
const configuration: SessionCreate = {
  dataset: 'org/data',
  policy: 'org/policy',
  urdf: null,
  device: 'cpu',
  joint_mapping: {},
  dataset_angle_unit: null,
  demo: false,
}
const episodes = [
  { index: 0, length: 2, duration: 1 / 30, task: 'pick' },
  { index: 1, length: 3, duration: 2 / 30, task: 'place' },
]
const episodeActions = {
  episode: 0,
  fps: 30,
  action_names: ['shoulder', 'elbow'],
  actions: [
    [1, 2],
    [1.1, 2.1],
  ],
}

function renderWorkspace(
  overrides: Partial<React.ComponentProps<typeof EvaluationWorkspace>> = {},
) {
  const props: React.ComponentProps<typeof EvaluationWorkspace> = {
    session,
    configuration,
    loading: false,
    settingsError: null,
    episodes,
    selectedEpisode: episodes[0],
    episodeIndex: 0,
    frameIndex: 0,
    frameData: frame,
    episodeActions,
    playing: false,
    speed: 1,
    selectedCameraKey: '',
    inference: null,
    inferenceStep: 0,
    inferencePlaying: false,
    inferenceRange: undefined,
    inferring: false,
    error: null,
    fps: 30,
    urdfUrl: '/api/sessions/session/urdf',
    onClose: vi.fn(),
    onLoad: vi.fn(),
    onEpisode: vi.fn(),
    onFrame: vi.fn(),
    onRestart: vi.fn(),
    onPreviousFrame: vi.fn(),
    onNextFrame: vi.fn(),
    onPlaying: vi.fn(),
    onSpeed: vi.fn(),
    onCamera: vi.fn(),
    onInfer: vi.fn(),
    onClearInference: vi.fn(),
    onInferenceStep: vi.fn(),
    onInferencePlaying: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<EvaluationWorkspace {...props} />) }
}

beforeEach(() => {
  componentState.robotViewer.mockClear()
  mockedApi.getRobots.mockResolvedValue([])
})

describe('EvaluationWorkspace', () => {
  it('assembles the configured workspace and forwards display interactions', async () => {
    const user = userEvent.setup()
    const onEpisode = vi.fn()
    const onFrame = vi.fn()
    const onCamera = vi.fn()
    const onClose = vi.fn()
    const onInfer = vi.fn()
    const onClearInference = vi.fn()
    renderWorkspace({
      session: { ...session, has_urdf: true, dataset_angle_unit: 'degrees' },
      frameData: {
        ...frame,
        images: {
          'observation.images.front': 'data:image/jpeg;base64,ZnJvbnQ=',
          'observation.images.wrist': 'data:image/jpeg;base64,d3Jpc3Q=',
        },
      },
      inference,
      onEpisode,
      onFrame,
      onCamera,
      onClose,
      onInfer,
      onClearInference,
    })

    expect(componentState.robotViewer).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/sessions/session/urdf',
        values: [1.02, 2.2],
        jointNames: ['shoulder', 'elbow'],
        mode: 'inference',
      }),
    )
    expect(screen.getByText('ROBOT MOTION')).toBeInTheDocument()
    expect(screen.getByAltText('observation.images.front observation')).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Camera stream' }), [
      'observation.images.wrist',
    ])
    expect(onCamera).toHaveBeenCalledWith('observation.images.wrist')

    await user.selectOptions(screen.getByRole('option', { name: '#001 — place' }).parentElement!, [
      '1',
    ])
    expect(onEpisode).toHaveBeenCalledWith(1)

    fireEvent.change(screen.getByRole('slider', { name: 'Episode timeline' }), {
      target: { value: '1' },
    })
    expect(onFrame).toHaveBeenCalledWith(1)

    await user.click(screen.getByRole('button', { name: 'Return to workspace setup' }))
    await user.click(screen.getByRole('button', { name: 'Infer action chunk' }))
    await user.click(screen.getByRole('button', { name: 'Clear inference' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onInfer).toHaveBeenCalledOnce()
    expect(onClearInference).toHaveBeenCalledOnce()
  })

  it('shows the camera and analysis empty states without a URDF or inference', () => {
    renderWorkspace({
      frameData: { ...frame, images: {} },
      selectedEpisode: undefined,
      episodeActions: null,
    })

    expect(screen.queryByText('ROBOT MOTION')).not.toBeInTheDocument()
    expect(screen.getByText('No camera observation')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Camera stream' })).toBeDisabled()
    expect(screen.getByText('No inference yet')).toBeInTheDocument()
    expect(screen.getByText('Loading episode actions…')).toBeInTheDocument()
  })
})
