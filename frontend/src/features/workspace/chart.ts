export const CHART_WIDTH = 1000
export const CHART_HEIGHT = 100
const VERTICAL_INSET = 8

/** Value domain with padding; flat or empty series still get a usable span. */
export function extent(values: number[], paddingRatio = 0.12): [number, number] {
  const finite = values.filter(Number.isFinite)
  if (finite.length === 0) return [0, 1]
  let min = Math.min(...finite)
  let max = Math.max(...finite)
  const span = max - min
  const padding = span > 0 ? span * paddingRatio : Math.max(Math.abs(max) * 0.05, 0.5)
  min -= padding
  max += padding
  return [min, max]
}

export function frameX(frame: number, frameCount: number, width = CHART_WIDTH): number {
  return (frame / Math.max(1, frameCount - 1)) * width
}

/** Horizontal position of a frame on any episode-wide track, in percent. */
export function framePercent(frame: number, frameCount: number): number {
  return frameX(frame, frameCount, 100)
}

/** Where a chunk sits on an episode-wide axis, at least `minWidth` wide so short chunks show. */
export function chunkSpan(
  chunk: { startFrame: number; endFrame: number },
  frameCount: number,
  width: number,
  minWidth: number,
): { x: number; width: number } {
  const x = frameX(chunk.startFrame, frameCount, width)
  return { x, width: Math.max(minWidth, frameX(chunk.endFrame - 1, frameCount, width) - x) }
}

export function valueY(value: number, [min, max]: [number, number], height = CHART_HEIGHT) {
  const span = Math.max(1e-9, max - min)
  return VERTICAL_INSET + (1 - (value - min) / span) * (height - VERTICAL_INSET * 2)
}

export function linePath(
  values: number[],
  startFrame: number,
  frameCount: number,
  domain: [number, number],
): string {
  let path = ''
  let drawing = false
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      drawing = false
      return
    }
    const x = frameX(startFrame + index, frameCount).toFixed(2)
    const y = valueY(value, domain).toFixed(2)
    path += `${drawing ? 'L' : 'M'}${x},${y}`
    drawing = true
  })
  return path
}

/** Frame under a pointer position within an element spanning the whole episode. */
export function frameAtPosition(
  clientX: number,
  bounds: { left: number; width: number },
  frameCount: number,
): number {
  if (bounds.width <= 0) return 0
  const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
  return Math.round(ratio * Math.max(0, frameCount - 1))
}
