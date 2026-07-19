import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'

import { timestamp } from '../timeline'

interface Props {
  frame: number
  length: number
  fps: number
  playing: boolean
  speed: number
  inferenceRange?: [number, number]
  onFrame: (frame: number) => void
  onPlaying: (playing: boolean) => void
  onSpeed: (speed: number) => void
}

export function Timeline(props: Props) {
  const { frame, length, fps, playing, speed, inferenceRange, onFrame, onPlaying, onSpeed } = props
  const progress = length > 1 ? (frame / (length - 1)) * 100 : 0
  const chunkLeft = inferenceRange ? (inferenceRange[0] / Math.max(1, length - 1)) * 100 : 0
  const chunkWidth = inferenceRange
    ? ((inferenceRange[1] - inferenceRange[0]) / Math.max(1, length - 1)) * 100
    : 0

  return (
    <section className="transport panel">
      <div className="timeline-wrap">
        <input
          aria-label="Episode timeline"
          className="timeline"
          type="range"
          min={0}
          max={Math.max(0, length - 1)}
          value={frame}
          style={{ '--progress': `${progress}%` } as React.CSSProperties}
          onChange={(event) => onFrame(Number(event.target.value))}
        />
        {inferenceRange && (
          <div className="chunk-range" style={{ left: `${chunkLeft}%`, width: `${chunkWidth}%` }}>
            <span>action chunk</span>
          </div>
        )}
      </div>
      <div className="transport-row">
        <div className="timecode">
          <strong>{timestamp(frame, fps)}</strong>
          <span>/ {timestamp(length - 1, fps)}</span>
        </div>
        <div className="playback-buttons">
          <button className="icon-button" aria-label="Restart" onClick={() => onFrame(0)}>
            <RotateCcw size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Previous frame"
            onClick={() => onFrame(Math.max(0, frame - 1))}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="play-button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={() => onPlaying(!playing)}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <button
            className="icon-button"
            aria-label="Next frame"
            onClick={() => onFrame(Math.min(length - 1, frame + 1))}
          >
            <SkipForward size={17} />
          </button>
        </div>
        <div className="speed-control">
          {[0.5, 1, 2].map((value) => (
            <button
              key={value}
              className={speed === value ? 'active' : ''}
              onClick={() => onSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
