import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { LoadingManager } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RobotViewer } from './RobotViewer'

const viewerState = vi.hoisted(() => ({
  loadedUrl: '',
  packages: '',
  manager: null as LoadingManager | null,
  rendererDisposed: false,
  controlsDisposed: false,
  observerDisconnected: false,
  cancelledAnimation: 0,
  controlUpdates: 0,
  meshShadows: null as { castShadow: boolean; receiveShadow: boolean } | null,
  models: [] as { visible: boolean; values: Record<string, number[]> }[],
  /** Hold the URDF load until the test calls `pendingLoad`. */
  deferLoad: false,
  /** Load a robot with no meshes and only fixed joints. */
  emptyModel: false,
  pendingLoad: null as (() => void) | null,
}))

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three')
  class WebGLRenderer {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: false }
    outputColorSpace = ''
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {
      viewerState.rendererDisposed = true
    }
  }
  return { ...actual, WebGLRenderer }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three')
  return {
    OrbitControls: class {
      target = new THREE.Vector3()
      enableDamping = false
      minDistance = 0
      maxDistance = 0
      update() {
        viewerState.controlUpdates += 1
      }
      dispose() {
        viewerState.controlsDisposed = true
      }
    },
  }
})

vi.mock('urdf-loader', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three')

  /** A two-joint robot whose clones get their own joints, like URDFRobot.copy. */
  class FakeRobot extends THREE.Group {
    joints: Record<string, { jointType: string; setJointValue: (value: number) => void }>
    record: { visible: boolean; values: Record<string, number[]> }

    constructor() {
      super()
      const record = {
        visible: true,
        values: { shoulder: [] as number[], gripper: [] as number[] },
      }
      this.record = record
      viewerState.models.push(record)
      this.joints = viewerState.emptyModel
        ? { base: { jointType: 'fixed', setJointValue: () => undefined } }
        : {
            shoulder: {
              jointType: 'revolute',
              setJointValue: (v) => record.values.shoulder.push(v),
            },
            gripper: {
              jointType: 'prismatic',
              setJointValue: (v) => record.values.gripper.push(v),
            },
            base: { jointType: 'fixed', setJointValue: () => undefined },
          }
      Object.defineProperty(this, 'visible', {
        get: () => record.visible,
        set: (value: boolean) => {
          record.visible = value
        },
      })
    }

    clone(recursive?: boolean): this {
      const copy = new FakeRobot()
      if (recursive) this.children.forEach((child) => copy.add(child.clone()))
      return copy as this
    }
  }

  return {
    default: class {
      packages = ''
      constructor(manager: LoadingManager) {
        viewerState.manager = manager
      }
      load(url: string, onLoad: (model: FakeRobot) => void) {
        viewerState.loadedUrl = url
        viewerState.packages = this.packages
        const finish = () => {
          const model = new FakeRobot()
          if (!viewerState.emptyModel) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.5))
            viewerState.meshShadows = mesh
            model.add(mesh)
          }
          onLoad(model)
        }
        if (viewerState.deferLoad) viewerState.pendingLoad = finish
        else finish()
      }
    },
  }
})

class ResizeObserverMock {
  observe() {}
  disconnect() {
    viewerState.observerDisconnected = true
  }
}

beforeEach(() => {
  Object.assign(viewerState, {
    loadedUrl: '',
    packages: '',
    manager: null,
    rendererDisposed: false,
    controlsDisposed: false,
    observerDisconnected: false,
    cancelledAnimation: 0,
    controlUpdates: 0,
    meshShadows: null,
    models: [],
    deferLoad: false,
    emptyModel: false,
    pendingLoad: null,
  })
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 41),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((animation: number) => {
      viewerState.cancelledAnimation = animation
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

const baseProps = {
  url: '/api/sessions/s/urdf',
  assetsUrl: 'http://host/api/sessions/s/assets',
  mapping: {},
  angleUnit: 'degrees' as const,
  theme: 'dark' as const,
}

describe('RobotViewer', () => {
  it('loads the robot, applies the pose, and cleans up', async () => {
    const { container, unmount, rerender } = render(
      <RobotViewer
        {...baseProps}
        pose={{ values: [90, Number.NaN], jointNames: ['shoulder.pos', 'gripper.pos'] }}
        ghost={null}
      />,
    )
    const [robot, ghost] = viewerState.models
    await waitFor(() => expect(robot.values.shoulder).toContainEqual(Math.PI / 2))
    expect(robot.values.gripper).toEqual([])
    expect(ghost.visible).toBe(false)
    expect(viewerState.loadedUrl).toBe('/api/sessions/s/urdf')
    expect(viewerState.packages).toBe('http://host/api/sessions/s/assets')
    expect(viewerState.meshShadows).toMatchObject({ castShadow: true, receiveShadow: true })
    expect(container.firstElementChild).toHaveAttribute('data-robot-bounds')

    rerender(
      <RobotViewer
        {...baseProps}
        theme="light"
        pose={{ values: [45, 0.02], jointNames: ['shoulder.pos', 'gripper.pos'] }}
        ghost={{ values: [30, 0.01], jointNames: ['shoulder.pos', 'gripper.pos'] }}
      />,
    )
    await waitFor(() => expect(ghost.visible).toBe(true))
    expect(ghost.values.shoulder).toContainEqual(Math.PI / 6)
    expect(ghost.values.gripper).toContainEqual(0.01)

    const updates = viewerState.controlUpdates
    fireEvent.click(screen.getByRole('button', { name: 'Reset 3D view' }))
    expect(viewerState.controlUpdates).toBeGreaterThan(updates)

    // Meshes finishing later rebuild the ghost from the fully loaded robot.
    act(() => viewerState.manager?.onLoad())
    expect(viewerState.models).toHaveLength(3)

    unmount()
    expect(viewerState.rendererDisposed).toBe(true)
    expect(viewerState.controlsDisposed).toBe(true)
    expect(viewerState.observerDisconnected).toBe(true)
    expect(viewerState.cancelledAnimation).toBe(41)
  })

  it('explains how to map dataset joints that are missing from the URDF', async () => {
    render(
      <RobotViewer
        {...baseProps}
        angleUnit="radians"
        pose={{ values: [1], jointNames: ['missing.pos'] }}
        ghost={null}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Joint mapping error')
    expect(screen.getByRole('alert')).toHaveTextContent('URDF joints: shoulder, gripper')
    expect(screen.getByRole('alert')).toHaveTextContent('{"missing.pos":"shoulder"}')
    expect(viewerState.models[0].values.shoulder).toEqual([])
  })

  it('waits for the robot before posing or framing, and handles an empty model', async () => {
    viewerState.deferLoad = true
    viewerState.emptyModel = true
    const { container } = render(
      <RobotViewer {...baseProps} pose={{ values: [1], jointNames: ['arm.pos'] }} ghost={null} />,
    )
    // Nothing is loaded yet: resetting the view and late mesh loads are no-ops.
    fireEvent.click(screen.getByRole('button', { name: 'Reset 3D view' }))
    act(() => viewerState.manager?.onLoad())
    expect(viewerState.models).toHaveLength(0)

    act(() => viewerState.pendingLoad?.())
    expect(await screen.findByRole('alert')).toHaveTextContent('URDF joints: (none)')
    expect(screen.getByRole('alert')).toHaveTextContent('{"arm.pos":"<urdf_joint_name>"}')
    expect(container.firstElementChild).not.toHaveAttribute('data-robot-bounds')
  })
})
