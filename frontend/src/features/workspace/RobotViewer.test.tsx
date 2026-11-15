import { render, screen, waitFor } from '@testing-library/react'
import type { Group } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RobotViewer } from './RobotViewer'

const viewerState = vi.hoisted(() => ({
  loadedUrl: '',
  packages: '',
  rendererDisposed: false,
  controlsDisposed: false,
  observerDisconnected: false,
  cancelledAnimation: 0,
  mesh: null as { castShadow: boolean; receiveShadow: boolean } | null,
  jointValues: { shoulder: [] as number[], gripper: [] as number[] },
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

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = {
      set: vi.fn(),
      copy: vi.fn(),
    }
    enableDamping = false
    minDistance = 0
    maxDistance = 0
    update() {}
    dispose() {
      viewerState.controlsDisposed = true
    }
  },
}))

vi.mock('urdf-loader', async () => {
  const THREE = await vi.importActual<typeof import('three')>('three')
  return {
    default: class {
      packages = ''
      load(url: string, onLoad: (model: Group) => void) {
        viewerState.loadedUrl = url
        viewerState.packages = this.packages
        const model = new THREE.Group() as Group & {
          joints: Record<string, { jointType: string; setJointValue: (value: number) => void }>
        }
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
        viewerState.mesh = mesh
        model.add(mesh)
        model.joints = {
          shoulder: {
            jointType: 'revolute',
            setJointValue: (value: number) => viewerState.jointValues.shoulder.push(value),
          },
          gripper: {
            jointType: 'prismatic',
            setJointValue: (value: number) => viewerState.jointValues.gripper.push(value),
          },
        }
        onLoad(model)
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
  viewerState.loadedUrl = ''
  viewerState.packages = ''
  viewerState.rendererDisposed = false
  viewerState.controlsDisposed = false
  viewerState.observerDisconnected = false
  viewerState.cancelledAnimation = 0
  viewerState.mesh = null
  viewerState.jointValues.shoulder = []
  viewerState.jointValues.gripper = []
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

describe('RobotViewer', () => {
  it('loads session assets, configures the model, applies finite values, and cleans up', async () => {
    const { container, unmount } = render(
      <RobotViewer
        url="/api/sessions/session-123/urdf"
        values={[90, Number.NaN]}
        jointNames={['shoulder.pos', 'gripper.pos']}
        mapping={{}}
        angleUnit="degrees"
        mode="inference"
      />,
    )

    expect(screen.getByText('POLICY OUTPUT')).toBeInTheDocument()
    await waitFor(() => expect(viewerState.jointValues.shoulder).toContainEqual(Math.PI / 2))
    expect(viewerState.jointValues.gripper).toEqual([])
    expect(viewerState.loadedUrl).toBe('/api/sessions/session-123/urdf')
    expect(viewerState.packages).toBe(`${window.location.origin}/api/sessions/session-123/assets`)
    expect(viewerState.mesh).toMatchObject({ castShadow: true, receiveShadow: true })
    expect(container.firstElementChild).toHaveAttribute('data-robot-bounds')

    unmount()
    expect(viewerState.rendererDisposed).toBe(true)
    expect(viewerState.controlsDisposed).toBe(true)
    expect(viewerState.observerDisconnected).toBe(true)
    expect(viewerState.cancelledAnimation).toBe(41)
  })

  it('shows actionable details when a dataset joint is absent from the URDF', async () => {
    render(
      <RobotViewer
        url="/api/sessions/session-123/urdf"
        values={[1]}
        jointNames={['missing.pos']}
        mapping={{}}
        angleUnit="radians"
        mode="dataset"
      />,
    )

    expect(screen.getByText('DATASET ACTION')).toBeInTheDocument()
    expect(await screen.findByText('JOINT MAPPING ERROR')).toBeInTheDocument()
    expect(screen.getByText(/Unmapped: missing\.pos/)).toHaveTextContent(
      'URDF joints: shoulder, gripper',
    )
    expect(viewerState.jointValues.shoulder).toEqual([])
  })
})
