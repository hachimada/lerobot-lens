import type {
  BundledRobot,
  Episode,
  EpisodeActions,
  FrameData,
  InferenceResult,
  SessionCreate,
  SessionSummary,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new Error(apiErrorMessage(body, response.status, response.statusText))
  }
  return response.json() as Promise<T>
}

export function apiErrorMessage(body: unknown, status: number, statusText: string): string {
  const fallback = statusText || `Request failed (${status})`
  if (!body || typeof body !== 'object' || !('detail' in body)) return fallback

  const detail = body.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const message = 'msg' in item && typeof item.msg === 'string' ? item.msg : null
        const location =
          'loc' in item && Array.isArray(item.loc) ? item.loc.slice(1).join('.') : null
        return message ? `${location ? `${location}: ` : ''}${message}` : null
      })
      .filter((message): message is string => Boolean(message))
    if (messages.length > 0) return messages.join(' ')
  }
  return fallback
}

export const api = {
  getRobots: () => request<BundledRobot[]>('/api/robots'),
  createSession: (payload: SessionCreate, signal?: AbortSignal) =>
    request<SessionSummary>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),
  getSession: (id: string, signal?: AbortSignal) =>
    request<SessionSummary>(`/api/sessions/${id}`, signal ? { signal } : undefined),
  getEpisodes: (id: string, signal?: AbortSignal) =>
    request<Episode[]>(`/api/sessions/${id}/episodes`, signal ? { signal } : undefined),
  getEpisodeActions: (id: string, episode: number, signal?: AbortSignal) =>
    request<EpisodeActions>(`/api/sessions/${id}/episodes/${episode}/actions`, { signal }),
  getFrame: (id: string, episode: number, frame: number, signal?: AbortSignal) =>
    request<FrameData>(`/api/sessions/${id}/episodes/${episode}/frames/${frame}`, { signal }),
  infer: (id: string, episode: number, frame: number, signal?: AbortSignal) =>
    request<InferenceResult>(`/api/sessions/${id}/infer`, {
      method: 'POST',
      body: JSON.stringify({ episode, frame }),
      ...(signal ? { signal } : {}),
    }),
  urdfUrl: (id: string) => `/api/sessions/${id}/urdf`,
}
