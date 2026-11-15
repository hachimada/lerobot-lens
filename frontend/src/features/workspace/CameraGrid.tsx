import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

import { bestColumns, cameraLabel } from './labels'
import styles from './CameraGrid.module.css'

interface Props {
  images: Record<string, string>
  timestamp: number
  loading: boolean
  /** A banner over the cameras, such as which frame the policy observed. */
  note?: string
}

const DEFAULT_ASPECT = 4 / 3

/** Every camera the policy observes, laid out as large as fits; one can be enlarged. */
export function CameraGrid({ images, timestamp, loading, note }: Props) {
  const [focused, setFocused] = useState<string | null>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [aspect, setAspect] = useState(DEFAULT_ASPECT)
  const grid = useRef<HTMLDivElement>(null)
  const keys = Object.keys(images)
  const shown = focused && keys.includes(focused) ? [focused] : keys

  useEffect(() => {
    const element = grid.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [keys.length])

  if (keys.length === 0) {
    return (
      <div className={styles.empty}>{loading ? 'Decoding frame…' : 'No camera observations'}</div>
    )
  }

  const columns = bestColumns(shown.length, box.width, box.height, aspect)

  return (
    <div className={styles.wrap}>
      {note && (
        <div className={styles.note} role="status">
          {note}
        </div>
      )}
      <div
        ref={grid}
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {shown.map((key) => {
          const isFocused = focused === key
          return (
            <figure className={styles.camera} key={key}>
              <img
                src={images[key]}
                alt={`${cameraLabel(key)} camera`}
                draggable={false}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget
                  if (naturalWidth > 0 && naturalHeight > 0) setAspect(naturalWidth / naturalHeight)
                }}
              />
              <figcaption>
                <span className={styles.label}>{cameraLabel(key)}</span>
                <span className={`${styles.time} mono`}>{timestamp.toFixed(2)}s</span>
              </figcaption>
              {keys.length > 1 && (
                <button
                  type="button"
                  className={styles.focus}
                  aria-label={isFocused ? 'Show all cameras' : `Enlarge ${cameraLabel(key)} camera`}
                  title={isFocused ? 'Show all cameras' : 'Enlarge'}
                  onClick={() => setFocused(isFocused ? null : key)}
                >
                  {isFocused ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
              )}
            </figure>
          )
        })}
      </div>
    </div>
  )
}
