import { describe, expect, it } from 'vitest'

import { convertJointValue, resolveJointTargets } from './robotJoints'

describe('resolveJointTargets', () => {
  it('applies exact, normalized, and implicit mappings in priority order', () => {
    expect(
      resolveJointTargets(['a.pos', 'b.pos', 'c.pos'], {
        'a.pos': 'exact',
        b: 'normalized',
      }),
    ).toEqual([
      { sourceName: 'a.pos', targetName: 'exact' },
      { sourceName: 'b.pos', targetName: 'normalized' },
      { sourceName: 'c.pos', targetName: 'c' },
    ])
  })
})

describe('convertJointValue', () => {
  it('converts degree values only for angular joints', () => {
    expect(convertJointValue(180, 'degrees', 'revolute')).toBeCloseTo(Math.PI)
    expect(convertJointValue(90, 'degrees', 'continuous')).toBeCloseTo(Math.PI / 2)
    expect(convertJointValue(5, 'degrees', 'prismatic')).toBe(5)
    expect(convertJointValue(1.2, 'radians', 'revolute')).toBe(1.2)
  })
})
