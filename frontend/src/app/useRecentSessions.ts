import { useCallback, useState } from 'react'

import type { SessionCreate } from '../shared/api/types'

export interface RecentSession {
  config: SessionCreate
  openedAt: number
}

export const RECENT_SESSIONS_KEY = 'lerobot-lens.recent-sessions'
const MAX_RECENT_SESSIONS = 6

export function recentSessionKey(config: SessionCreate): string {
  return [config.dataset, config.policy ?? '', config.urdf ?? ''].join('\u0000')
}

function isRecentSession(value: unknown): value is RecentSession {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecentSession>
  return (
    typeof candidate.openedAt === 'number' &&
    !!candidate.config &&
    typeof candidate.config.dataset === 'string' &&
    candidate.config.dataset.length > 0
  )
}

export function readRecentSessions(): RecentSession[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_SESSIONS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecentSession) : []
  } catch {
    return []
  }
}

function writeRecentSessions(recents: RecentSession[]) {
  try {
    window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(recents))
  } catch {
    // Recents are a convenience; the session itself still opens.
  }
}

/** Sessions opened before on this browser, newest first. Demo sessions are not kept. */
export function useRecentSessions() {
  const [recents, setRecents] = useState<RecentSession[]>(readRecentSessions)

  const remember = useCallback((config: SessionCreate) => {
    if (config.demo) return
    setRecents((current) => {
      const key = recentSessionKey(config)
      const next = [
        { config, openedAt: Date.now() },
        ...current.filter((recent) => recentSessionKey(recent.config) !== key),
      ].slice(0, MAX_RECENT_SESSIONS)
      writeRecentSessions(next)
      return next
    })
  }, [])

  const forget = useCallback((config: SessionCreate) => {
    setRecents((current) => {
      const key = recentSessionKey(config)
      const next = current.filter((recent) => recentSessionKey(recent.config) !== key)
      writeRecentSessions(next)
      return next
    })
  }, [])

  return { recents, remember, forget }
}
