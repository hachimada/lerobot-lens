export const timestamp = (frame: number, fps: number) => {
  const seconds = frame / fps
  const mins = Math.floor(seconds / 60)
  return `${mins}:${(seconds % 60).toFixed(2).padStart(5, '0')}`
}
