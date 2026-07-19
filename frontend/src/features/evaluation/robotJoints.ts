import * as THREE from 'three'

export function resolveJointTargets(jointNames: string[], mapping: Record<string, string>) {
  return jointNames.map((sourceName) => {
    const normalizedName = sourceName.replace(/\.pos$/, '')
    return {
      sourceName,
      targetName: mapping[sourceName] ?? mapping[normalizedName] ?? normalizedName,
    }
  })
}

export function convertJointValue(
  value: number,
  angleUnit: 'degrees' | 'radians',
  jointType: string,
) {
  return angleUnit === 'degrees' && ['revolute', 'continuous'].includes(jointType)
    ? THREE.MathUtils.degToRad(value)
    : value
}
