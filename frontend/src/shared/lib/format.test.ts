import { describe, expect, it } from 'vitest'

import {
  artifactName,
  displayName,
  formatSigned,
  formatValue,
  jointLabel,
  padEpisode,
  relativeTime,
  timecode,
} from './format'

describe('displayName', () => {
  it('shortens local training checkpoints to their run and step', () => {
    expect(displayName('/out/train/act_run/run/checkpoints/040000/pretrained_model')).toBe(
      'act_run @ 040000',
    )
    expect(displayName('outputs/act_run/checkpoints/last/pretrained_model')).toBe('act_run @ last')
    expect(displayName('checkpoints/020000')).toBe('020000')
  })

  it('keeps Hub IDs and URIs readable and reduces other local paths to their last segment', () => {
    expect(displayName('lerobot/pusht')).toBe('lerobot/pusht')
    expect(displayName('builtin://so101')).toBe('so101')
    expect(displayName('/data/sets/my_dataset/')).toBe('my_dataset')
    expect(displayName('~/robot.urdf')).toBe('robot.urdf')
    expect(displayName('a/b/c')).toBe('c')
    expect(displayName(null)).toBe('')
    expect(displayName(undefined)).toBe('')
  })
})

describe('artifactName', () => {
  it('separates the checkpoint step so it is never truncated away', () => {
    expect(artifactName('/x/run_a/run/checkpoints/010000/pretrained_model')).toEqual({
      name: 'run_a',
      step: '010000',
    })
    expect(artifactName('org/policy')).toEqual({ name: 'org/policy' })
  })
})

describe('formatting helpers', () => {
  it('formats timecodes, relative times, values, joints, and episodes', () => {
    expect(timecode(45, 30)).toBe('0:01.50')
    expect(timecode(1830, 30)).toBe('1:01.00')
    expect(timecode(-5, 0)).toBe('0:00.00')

    const now = 1_000_000_000
    expect(relativeTime(now - 10_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago')

    expect(formatValue(1.234)).toBe('1.23')
    expect(formatValue(1234.5)).toBe('1235')
    expect(formatValue(0.0012)).toBe('1.2e-3')
    expect(formatValue(0)).toBe('0.00')
    expect(formatValue(undefined)).toBe('—')
    expect(formatValue(Number.NaN)).toBe('—')

    expect(formatSigned(0.5)).toBe('+0.50')
    expect(formatSigned(-0.5)).toBe('-0.50')
    expect(formatSigned(0)).toBe('0.00')
    expect(formatSigned(undefined)).toBe('—')

    expect(jointLabel('shoulder_pan.pos', 0)).toBe('shoulder_pan')
    expect(jointLabel(undefined, 2)).toBe('joint 3')
    expect(padEpisode(7)).toBe('#007')
  })
})
