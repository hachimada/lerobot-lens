const WIDTH = 1120
const HEIGHT = 310
const PAD = { left: 58, right: 22, top: 24, bottom: 34 }

export function linePath(
  values: number[],
  startFrame: number,
  totalFrames: number,
  min: number,
  max: number,
) {
  const xRange = WIDTH - PAD.left - PAD.right
  const yRange = HEIGHT - PAD.top - PAD.bottom
  const denominator = Math.max(1, totalFrames - 1)
  const valueRange = Math.max(1e-6, max - min)
  return values
    .map((value, index) => {
      const x = PAD.left + ((startFrame + index) / denominator) * xRange
      const y = PAD.top + (1 - (value - min) / valueRange) * yRange
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
