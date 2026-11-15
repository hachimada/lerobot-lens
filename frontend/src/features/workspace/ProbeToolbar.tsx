import { useState } from 'react'
import { LoaderCircle, ScanLine, Sparkles, SquarePen, Trash2, X } from 'lucide-react'

import type { ScanProgress } from '../../app/useProbes'
import { ConfirmButton } from '../../shared/ui/ConfirmButton'
import { scanStride } from './probes'
import { shortcutHint, withShortcut } from './shortcuts'
import styles from './ProbeToolbar.module.css'

interface Props {
  hasPolicy: boolean
  frame: number
  frameCount: number
  /** Actions one inference returns; scans advance by this, less the overlap. */
  chunkSize: number | null
  /** Probes in this episode, which the clear action removes. */
  probeCount: number
  probing: boolean
  scan: ScanProgress | null
  error: string | null
  onProbe: () => void
  onScan: (stride: number) => void
  onCancelScan: () => void
  onClearAll: () => void
  onDismissError: () => void
  onAddPolicy: () => void
}

const OVERLAPS = [0, 5, 10, 20, 25, 30, 40, 50, 75, 100]

/**
 * Actions on this episode's probes. Before the first probe, probing the whole
 * episode is the call to action where the chunks will appear; afterwards every
 * action is an equal, quiet control so the selected chunk stands out instead.
 */
export function ProbeToolbar(props: Props) {
  const {
    hasPolicy,
    frame,
    frameCount,
    chunkSize,
    probeCount,
    probing,
    scan,
    error,
    onProbe,
    onScan,
    onCancelScan,
    onClearAll,
    onDismissError,
    onAddPolicy,
  } = props
  const [overlap, setOverlap] = useState(0)
  const overlaps = chunkSize ? OVERLAPS.filter((value) => value < chunkSize) : [0]
  const effectiveOverlap = overlaps.includes(overlap) ? overlap : 0
  const stride = chunkSize ? scanStride(chunkSize, effectiveOverlap) : null
  const empty = probeCount === 0 && !scan

  const scanButton = (
    <button
      type="button"
      className={empty ? `btn ${styles.run}` : `btn btn-sm ${styles.control}`}
      disabled={probing || !stride}
      title={
        stride
          ? `Probe every ${stride} frames: ${chunkSize}-step chunks sharing ${effectiveOverlap} steps`
          : 'Run one probe first to learn the chunk length'
      }
      onClick={() => stride && onScan(stride)}
    >
      <ScanLine size={empty ? 16 : 14} /> Probe whole episode
    </button>
  )

  const overlapField = (
    <label className={styles.overlap} title="How many steps consecutive chunks share">
      Overlap
      <select
        className={`input ${styles.overlapSelect}`}
        aria-label="Chunk overlap"
        value={effectiveOverlap}
        disabled={!chunkSize}
        onChange={(event) => setOverlap(Number(event.target.value))}
      >
        {overlaps.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      steps
      {stride && (
        <span className={styles.plan}>
          · {Math.ceil(frameCount / stride)} chunks, every {stride} frames
        </span>
      )}
    </label>
  )

  const frameButton = (
    <button
      type="button"
      className={`btn btn-sm ${styles.control}`}
      disabled={probing || !!scan}
      title={
        scan
          ? 'Wait for the whole-episode probe to finish'
          : withShortcut('Run the policy on this frame', 'probe')
      }
      onClick={onProbe}
    >
      {probing ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
      {probing ? 'Running policy…' : `Probe frame ${frame}`}
      <span className="kbd">{shortcutHint('probe')}</span>
    </button>
  )

  let actions
  if (!hasPolicy) {
    actions = (
      <div className={styles.noPolicy}>
        <span>No policy loaded: this session can only browse the recording.</span>
        <button type="button" className={`btn btn-sm ${styles.control}`} onClick={onAddPolicy}>
          <SquarePen size={14} /> Add a policy
        </button>
      </div>
    )
  } else if (empty) {
    actions = (
      <div className={styles.empty}>
        <div className={styles.row}>
          {scanButton}
          {overlapField}
        </div>
        <div className={styles.row}>
          <span className={styles.alternative}>Or check a single frame:</span>
          {frameButton}
        </div>
      </div>
    )
  } else {
    actions = (
      <div className={styles.row}>
        {scan ? (
          <div className={styles.scanProgress} role="status">
            <LoaderCircle className="spin" size={14} />
            <span>
              Probing chunk <span className="mono">{scan.completed}</span> /{' '}
              <span className="mono">{scan.total}</span>
            </span>
            <span className={styles.bar} aria-hidden="true">
              <i style={{ width: `${(scan.completed / Math.max(1, scan.total)) * 100}%` }} />
            </span>
            <button type="button" className={`btn btn-sm ${styles.control}`} onClick={onCancelScan}>
              Stop
            </button>
          </div>
        ) : (
          <>
            {scanButton}
            {overlapField}
          </>
        )}
        <span className={styles.divider} aria-hidden="true" />
        {frameButton}
        <span className={styles.divider} aria-hidden="true" />
        <ConfirmButton
          className={`btn btn-sm ${styles.control} ${styles.clear}`}
          confirmLabel={`Clear ${probeCount} probe${probeCount === 1 ? '' : 's'}`}
          disabled={probeCount === 0 || probing || !!scan}
          onConfirm={onClearAll}
        >
          <Trash2 size={14} /> Clear all probes
        </ConfirmButton>
      </div>
    )
  }

  return (
    <div className={styles.toolbar} role="group" aria-label="Probe actions">
      {actions}
      {error && (
        <div className={`error-banner ${styles.error}`} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss error"
            onClick={onDismissError}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
