declare module 'urdf-loader' {
  import type { LoadingManager, Object3D } from 'three'

  export interface URDFJoint {
    jointType: string
    setJointValue(value: number): void
  }

  export interface URDFRobot extends Object3D {
    joints: Record<string, URDFJoint>
    links: Record<string, Object3D>
    robotName: string
  }

  export default class URDFLoader {
    constructor(manager?: LoadingManager)
    packages: string | Record<string, string> | ((pkg: string) => string)
    workingPath: string
    load(
      url: string,
      onLoad: (robot: URDFRobot) => void,
      onProgress?: ((event: ProgressEvent) => void) | null,
      onError?: (error: Error) => void,
    ): void
    loadAsync(url: string): Promise<URDFRobot>
    parse(content: string | Document | Element, workingPath?: string): URDFRobot
  }
}
