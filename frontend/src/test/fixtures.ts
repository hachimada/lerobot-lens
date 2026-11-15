import type { FrameData, InferenceResult, SessionSummary } from '../shared/api/types'

export const session: SessionSummary = {
  id: 'session',
  status: 'ready',
  dataset: 'org/data',
  policy: 'org/policy',
  device: 'cpu',
  message: 'ready',
  fps: 30,
  episode_count: 1,
  camera_keys: ['observation.images.front'],
  state_key: 'observation.state',
  action_dim: 2,
  joint_names: ['shoulder', 'elbow'],
  action_names: ['shoulder', 'elbow'],
  joint_mapping: {},
  dataset_angle_unit: null,
  has_urdf: false,
  demo: false,
  action_chunk_size: 2,
}

export const frame: FrameData = {
  episode: 0,
  frame: 0,
  timestamp: 1.25,
  state: [1, 2],
  action: [1.1, 2.1],
  images: { 'observation.images.front': 'data:image/jpeg;base64,aW1hZ2U=' },
}

export const inference: InferenceResult = {
  episode: 0,
  start_frame: 0,
  fps: 30,
  predicted_actions: [
    [1.02, 2.2],
    [1.1, 2.3],
  ],
  ground_truth_actions: [
    [1, 2],
    [1, 2],
  ],
  chunk_size: 2,
}
