import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import type { Episode } from '../../shared/api/types'
import { padEpisode } from '../../shared/lib/format'
import { matchesEpisode } from './labels'
import type { ErrorLevel } from './probes'
import styles from './EpisodeBrowser.module.css'

export interface EpisodeProbeSummary {
  count: number
  level: ErrorLevel
}

interface Props {
  episodes: Episode[]
  selectedIndex: number
  summaries: Map<number, EpisodeProbeSummary>
  onSelect: (index: number) => void
}

/** The episode list; memoized, since its props hold still while an episode plays. */
export const EpisodeBrowser = memo(function EpisodeBrowser({
  episodes,
  selectedIndex,
  summaries,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('')
  const list = useRef<HTMLUListElement>(null)
  const visible = useMemo(
    () => episodes.filter((episode) => matchesEpisode(episode, query)),
    [episodes, query],
  )
  const tasks = useMemo(() => new Set(episodes.map((episode) => episode.task)), [episodes])
  const showTasks = tasks.size > 1

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>('[aria-current="true"]')
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <nav className={styles.browser} aria-label="Episodes">
      <div className={styles.header}>
        <h2>
          Episodes <span className="count-pill">{episodes.length}</span>
        </h2>
        {!showTasks && episodes[0]?.task && (
          <p className={styles.sharedTask} title={episodes[0].task}>
            {episodes[0].task}
          </p>
        )}
        <label className={styles.search}>
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={showTasks ? 'Number or task' : 'Episode number'}
            aria-label="Filter episodes"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <ul ref={list} className={styles.list}>
        {visible.map((episode) => {
          const summary = summaries.get(episode.index)
          const selected = episode.index === selectedIndex
          return (
            <li key={episode.index}>
              <button
                type="button"
                className={styles.item}
                aria-current={selected}
                title={episode.task || undefined}
                onClick={() => onSelect(episode.index)}
              >
                <span className={`${styles.index} mono`}>{padEpisode(episode.index)}</span>
                <span className={styles.meta}>
                  {showTasks && episode.task && <span className={styles.task}>{episode.task}</span>}
                  <span className={styles.duration}>{episode.duration.toFixed(1)}s</span>
                </span>
                {summary && (
                  <span
                    className={`${styles.badge} level-${summary.level}`}
                    title={`${summary.count} probe${summary.count === 1 ? '' : 's'}`}
                  >
                    {summary.count}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {visible.length === 0 && <li className={styles.empty}>No matching episodes</li>}
      </ul>
    </nav>
  )
})
