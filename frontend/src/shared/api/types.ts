export type SessionStatus = 'loading' | 'ready' | 'error'

export interface SessionSummary {
  id: string
  status: SessionStatus
  dataset: string
  policy: string | null
  device: string
  message: string
  fps: number | null
  episode_count: number | null
  camera_keys: string[]
  state_key: string | null
  action_dim: number | null
  joint_names: string[]
  action_names: string[]
  joint_mapping: Record<string, string>
  dataset_angle_unit: 'degrees' | 'radians' | null
  has_urdf: boolean
  demo: boolean
}

export interface Episode {
  index: number
  length: number
  duration: number
  task: string
}

export interface FrameData {
  episode: number
  frame: number
  timestamp: number
  state: number[]
  action: number[]
  images: Record<string, string>
}

export interface EpisodeActions {
  episode: number
  fps: number
  action_names: string[]
  actions: number[][]
}

export interface InferenceResult {
  episode: number
  start_frame: number
  fps: number
  predicted_actions: number[][]
  ground_truth_actions: number[][]
  chunk_size: number
}

export interface SessionCreate {
  dataset: string
  policy: string | null
  urdf: string | null
  device: string
  joint_mapping: Record<string, string>
  dataset_angle_unit: 'degrees' | 'radians' | null
  demo: boolean
}

export interface BundledRobot {
  id: string
  name: string
  urdf: string
}
