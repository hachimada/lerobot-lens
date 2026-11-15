import type { Episode } from '../../shared/api/types'
import { padEpisode } from '../../shared/lib/format'

/** A chunk's frames, inclusive: `76–123`. */
export function frameRange(chunk: { startFrame: number; endFrame: number }): string {
  return `${chunk.startFrame}–${chunk.endFrame - 1}`
}

export function cameraLabel(key: string): string {
  return key.replace(/^observation\.images?\./, '').replace(/^observation\./, '')
}

/** Whether an episode matches a filter by number (`12`, `#012`) or task text. */
export function matchesEpisode(episode: Episode, query: string): boolean {
  const normalized = query.trim().toLowerCase().replace(/^#/, '')
  if (!normalized) return true
  return (
    String(episode.index) === String(Number(normalized)) ||
    padEpisode(episode.index).slice(1).startsWith(normalized) ||
    episode.task.toLowerCase().includes(normalized)
  )
}

/**
 * Column count that makes `count` images of the given aspect ratio as large as
 * possible inside a `width` × `height` box.
 */
export function bestColumns(
  count: number,
  width: number,
  height: number,
  aspect: number,
  gap = 6,
): number {
  if (count <= 1 || width <= 0 || height <= 0) return 1
  let best = 1
  let bestArea = 0
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns)
    const cellWidth = (width - gap * (columns - 1)) / columns
    const cellHeight = (height - gap * (rows - 1)) / rows
    const imageWidth = Math.min(cellWidth, cellHeight * aspect)
    const area = imageWidth * (imageWidth / aspect)
    if (area > bestArea + 1e-6) {
      bestArea = area
      best = columns
    }
  }
  return best
}
