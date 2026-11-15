import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionCreate } from '../shared/api/types'
import {
  readRecentSessions,
  RECENT_SESSIONS_KEY,
  recentSessionKey,
  useRecentSessions,
} from './useRecentSessions'
import { initialTheme, THEME_STORAGE_KEY, useTheme } from './useTheme'

function config(dataset: string, overrides: Partial<SessionCreate> = {}): SessionCreate {
  return {
    dataset,
    policy: 'org/policy',
    urdf: null,
    device: 'auto',
    joint_mapping: {},
    dataset_angle_unit: null,
    demo: false,
    ...overrides,
  }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete document.documentElement.dataset.theme
})

describe('useTheme', () => {
  it('prefers the saved theme, then the system preference, then dark', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    expect(initialTheme()).toBe('light')

    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(initialTheme()).toBe('light')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(initialTheme()).toBe('dark')
    vi.stubGlobal('matchMedia', undefined)
    expect(initialTheme()).toBe('dark')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(initialTheme()).toBe('dark')
  })

  it('applies the theme to the document, persists it, and toggles', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(document.documentElement.dataset.theme).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('still switches themes when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(document.documentElement.dataset.theme).toBe(result.current.theme)
  })
})

describe('useRecentSessions', () => {
  it('keeps the newest sessions first, without duplicates or demos, and persists them', () => {
    const { result } = renderHook(() => useRecentSessions())
    act(() => result.current.remember(config('a')))
    act(() => result.current.remember(config('b')))
    act(() => result.current.remember(config('a')))
    act(() => result.current.remember(config('demo', { demo: true })))

    expect(result.current.recents.map((recent) => recent.config.dataset)).toEqual(['a', 'b'])
    expect(readRecentSessions().map((recent) => recent.config.dataset)).toEqual(['a', 'b'])

    for (const name of ['c', 'd', 'e', 'f', 'g']) act(() => result.current.remember(config(name)))
    expect(result.current.recents).toHaveLength(6)
    expect(result.current.recents[0].config.dataset).toBe('g')

    act(() => result.current.forget(config('g')))
    expect(result.current.recents.map((recent) => recent.config.dataset)).not.toContain('g')
    expect(recentSessionKey(config('x', { policy: null }))).toBe('x\u0000\u0000')
  })

  it('ignores malformed storage and storage failures', () => {
    window.localStorage.setItem(RECENT_SESSIONS_KEY, '{not json')
    expect(readRecentSessions()).toEqual([])
    window.localStorage.setItem(
      RECENT_SESSIONS_KEY,
      JSON.stringify([{ openedAt: 1, config: config('ok') }, { openedAt: 'x' }, null, 'bad']),
    )
    expect(readRecentSessions().map((recent) => recent.config.dataset)).toEqual(['ok'])
    window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify({ not: 'a list' }))
    expect(readRecentSessions()).toEqual([])

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => useRecentSessions())
    act(() => result.current.remember(config('kept')))
    expect(result.current.recents[0].config.dataset).toBe('kept')
  })
})
