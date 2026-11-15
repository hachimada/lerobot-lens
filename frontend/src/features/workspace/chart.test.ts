import { describe, expect, it } from 'vitest'

import { extent, frameAtPosition, frameX, linePath, valueY } from './chart'
import { bestColumns, cameraLabel, matchesEpisode } from './labels'

describe('chart scales', () => {
  it('pads value extents and handles flat or empty series', () => {
    expect(extent([0, 10])).toEqual([-1.2, 11.2])
    expect(extent([5, 5])).toEqual([4.5, 5.5])
    expect(extent([100, 100])).toEqual([95, 105])
    expect(extent([Number.NaN])).toEqual([0, 1])
  })

  it('maps frames and values to chart coordinates', () => {
    expect(frameX(5, 11)).toBe(500)
    expect(frameX(0, 1)).toBe(0)
    expect(valueY(10, [0, 10])).toBe(8)
    expect(valueY(0, [0, 10])).toBe(92)
  })

  it('draws paths that break at missing values', () => {
    expect(linePath([0, 10, Number.NaN, 10], 0, 4, [0, 10])).toBe(
      'M0.00,92.00L333.33,8.00M1000.00,8.00',
    )
  })

  it('converts pointer positions to frames', () => {
    const bounds = { left: 100, width: 200 }
    expect(frameAtPosition(200, bounds, 11)).toBe(5)
    expect(frameAtPosition(0, bounds, 11)).toBe(0)
    expect(frameAtPosition(900, bounds, 11)).toBe(10)
    expect(frameAtPosition(150, { left: 0, width: 0 }, 11)).toBe(0)
  })
})

describe('workspace labels', () => {
  it('shortens camera keys', () => {
    expect(cameraLabel('observation.images.wrist')).toBe('wrist')
    expect(cameraLabel('observation.image')).toBe('image')
    expect(cameraLabel('front')).toBe('front')
  })

  it('filters episodes by number or task', () => {
    const episode = { index: 12, length: 10, duration: 1, task: 'Pick the cube' }
    expect(matchesEpisode(episode, '')).toBe(true)
    expect(matchesEpisode(episode, '12')).toBe(true)
    expect(matchesEpisode(episode, '#012')).toBe(true)
    expect(matchesEpisode(episode, '01')).toBe(true)
    expect(matchesEpisode(episode, 'cube')).toBe(true)
    expect(matchesEpisode(episode, '3')).toBe(false)
  })

  it('picks the camera column count that maximizes image size', () => {
    expect(bestColumns(1, 800, 400, 4 / 3)).toBe(1)
    expect(bestColumns(2, 900, 300, 4 / 3)).toBe(2)
    expect(bestColumns(2, 400, 600, 4 / 3)).toBe(1)
    expect(bestColumns(4, 800, 600, 4 / 3)).toBe(2)
    expect(bestColumns(3, 0, 0, 4 / 3)).toBe(1)
  })
})
