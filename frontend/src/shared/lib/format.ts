/**
 * Short, human-friendly name for a dataset, policy, or robot reference.
 *
 * Local training checkpoints such as
 * `/outputs/train/act_run/run/checkpoints/040000/pretrained_model` become
 * `act_run @ 040000`, local paths keep their last segment, and Hub IDs
 * (`org/name`) and URIs (`builtin://so101`) stay readable as they are.
 */
export function displayName(reference: string | null | undefined): string {
  if (!reference) return ''
  const uri = /^[a-z][a-z0-9+.-]*:\/\/(.+)$/i.exec(reference)
  if (uri) return uri[1]

  const parts = reference.split(/[\\/]+/).filter(Boolean)
  if (parts.at(-1) === 'pretrained_model') parts.pop()
  const checkpoints = parts.lastIndexOf('checkpoints')
  if (checkpoints >= 0 && checkpoints < parts.length - 1) {
    const run = parts[checkpoints - 1] === 'run' ? checkpoints - 2 : checkpoints - 1
    const base = parts[run]
    const step = parts[checkpoints + 1]
    return base ? `${base} @ ${step}` : step
  }
  const isLocalPath = /^([/~.]|[a-z]:[\\/])/i.test(reference)
  if (isLocalPath || parts.length > 2) return parts.at(-1) ?? reference
  return parts.join('/')
}

/** `m:ss.cc` timecode for a frame index. */
export function timecode(frame: number, fps: number): string {
  const seconds = Math.max(0, frame) / Math.max(1, fps)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

/** Compact numeric formatting that keeps small values readable. */
export function formatValue(value: number | undefined | null, digits = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—'
  const magnitude = Math.abs(value)
  if (magnitude >= 1000) return value.toFixed(0)
  if (magnitude > 0 && magnitude < 0.01) return value.toExponential(1)
  return value.toFixed(digits)
}

/** Like `formatValue`, with an explicit `+` on positive values. */
export function formatSigned(value: number | undefined | null, digits = 2): string {
  const formatted = formatValue(value, digits)
  return value !== undefined && value !== null && value > 0 ? `+${formatted}` : formatted
}

export function jointLabel(name: string | undefined, index: number): string {
  return name ? name.replace(/\.pos$/, '') : `joint ${index + 1}`
}

export function padEpisode(index: number): string {
  return `#${String(index).padStart(3, '0')}`
}

export interface ArtifactName {
  name: string
  /** Checkpoint step for local training outputs, shown apart so truncation never hides it. */
  step?: string
}

export function artifactName(reference: string | null | undefined): ArtifactName {
  const full = displayName(reference)
  const match = /^(.*) @ ([^@]+)$/.exec(full)
  return match ? { name: match[1], step: match[2] } : { name: full }
}
