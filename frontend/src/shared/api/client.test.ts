import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, apiErrorMessage } from './client'

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('apiErrorMessage', () => {
  it('uses string details and formats FastAPI validation errors', () => {
    expect(apiErrorMessage({ detail: 'broken' }, 400, 'Bad Request')).toBe('broken')
    expect(
      apiErrorMessage(
        {
          detail: [
            { loc: ['body', 'dataset'], msg: 'Field required' },
            { loc: ['body', 'frame'], msg: 'Must be positive' },
          ],
        },
        422,
        'Unprocessable Entity',
      ),
    ).toBe('dataset: Field required frame: Must be positive')
  })

  it('falls back safely for malformed or empty response bodies', () => {
    expect(apiErrorMessage(null, 500, 'Server Error')).toBe('Server Error')
    expect(apiErrorMessage({ detail: [{}] }, 418, '')).toBe('Request failed (418)')
  })
})

describe('api client', () => {
  it('sends JSON requests and returns parsed responses', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ id: 'session' })))
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      dataset: 'org/data',
      policy: null,
      urdf: null,
      device: 'cpu',
      joint_mapping: {},
      dataset_angle_unit: null,
      demo: false,
    } as const
    await api.createSession(payload)

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    })

    const controller = new AbortController()
    await api.createSession(payload, controller.signal)
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('builds every endpoint path and forwards abort signals', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await api.getRobots()
    await api.getSession('s', controller.signal)
    await api.getEpisodes('s', controller.signal)
    await api.getEpisodeActions('s', 2, controller.signal)
    await api.getFrame('s', 2, 3, controller.signal)
    await api.infer('s', 2, 3, controller.signal)

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/robots',
      '/api/sessions/s',
      '/api/sessions/s/episodes',
      '/api/sessions/s/episodes/2/actions',
      '/api/sessions/s/episodes/2/frames/3',
      '/api/sessions/s/infer',
    ])
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ signal: controller.signal })
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ signal: controller.signal })
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ signal: controller.signal })
    expect(fetchMock.mock.calls[4]?.[1]).toMatchObject({ signal: controller.signal })
    expect(fetchMock.mock.calls[5]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ episode: 2, frame: 3 }),
      signal: controller.signal,
    })
    expect(api.urdfUrl('s')).toBe('/api/sessions/s/urdf')
  })

  it('throws a readable error when the response is not successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            { detail: [{ loc: ['body', 'dataset'], msg: 'Field required' }] },
            { status: 422 },
          ),
        ),
    )
    await expect(api.getRobots()).rejects.toThrow('dataset: Field required')
  })
})
