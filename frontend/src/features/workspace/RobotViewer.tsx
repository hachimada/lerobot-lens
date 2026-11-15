import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import URDFLoader from 'urdf-loader'
import { Crosshair } from 'lucide-react'

import type { Theme } from '../../app/useTheme'
import { convertJointValue, resolveJointTargets } from './robotJoints'
import styles from './RobotViewer.module.css'

interface URDFRobot extends THREE.Object3D {
  joints: Record<string, { setJointValue: (value: number) => void; jointType: string }>
}

export interface RobotPose {
  values: number[]
  jointNames: string[]
}

interface Props {
  url: string
  assetsUrl: string
  pose: RobotPose
  /** A second, translucent robot drawn for comparison (the recorded action). */
  ghost: RobotPose | null
  mapping: Record<string, string>
  angleUnit: 'degrees' | 'radians'
  theme: Theme
}

interface SceneHandles {
  scene: THREE.Scene
  floor: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>
  grid: THREE.GridHelper | null
  ghostMaterial: THREE.MeshStandardMaterial
  fit: () => void
  /** Draw the scene on the next animation frame; frames are only drawn when asked for. */
  invalidate: () => void
}

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function makeGrid(): THREE.GridHelper {
  const grid = new THREE.GridHelper(
    4,
    20,
    cssColor('--viewer-grid', '#2b323d'),
    cssColor('--viewer-grid-minor', '#1b2028'),
  )
  grid.rotation.x = Math.PI / 2
  grid.position.z = 0.001
  return grid
}

function applyPose(
  robot: URDFRobot,
  pose: RobotPose,
  mapping: Record<string, string>,
  unit: Props['angleUnit'],
) {
  const targets = resolveJointTargets(pose.jointNames, mapping)
  pose.values.forEach((value, index) => {
    const name = targets[index]?.targetName
    const joint = name ? robot.joints[name] : undefined
    if (!joint || !Number.isFinite(value)) return
    joint.setJointValue(convertJointValue(value, unit, joint.jointType))
  })
}

export function RobotViewer({ url, assetsUrl, pose, ghost, mapping, angleUnit, theme }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const robot = useRef<URDFRobot | null>(null)
  const ghostRobot = useRef<URDFRobot | null>(null)
  const handles = useRef<SceneHandles | null>(null)
  const [loadedRevision, setLoadedRevision] = useState(0)
  const [mappingError, setMappingError] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return
    const element = host.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 50)
    camera.up.set(0, 0, 1)
    camera.position.set(1.2, 1.2, 0.9)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0.2)
    controls.enableDamping = true
    controls.minDistance = 0.15
    controls.maxDistance = 6

    // Render on demand rather than every display frame: an idle viewer costs nothing.
    let frame = 0
    const draw = () => {
      frame = 0
      // While the camera eases after a drag, this update moves it again, and the
      // controls' change event asks for the next frame until it settles.
      controls.update()
      renderer.render(scene, camera)
    }
    const invalidate = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    controls.addEventListener('change', invalidate)

    scene.add(new THREE.HemisphereLight('#ffffff', '#5d6470', 2.2))
    const key = new THREE.DirectionalLight('#ffffff', 2.6)
    key.position.set(2, 3, 2)
    key.castShadow = true
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 64),
      new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    )
    floor.receiveShadow = true
    scene.add(floor)

    const ghostMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      roughness: 0.6,
    })

    const fit = () => {
      const target = robot.current
      if (!target) return
      target.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(target)
      if (bounds.isEmpty()) return
      const size = bounds.getSize(new THREE.Vector3())
      const sphere = bounds.getBoundingSphere(new THREE.Sphere())
      // Distance that keeps the bounding sphere in view for both the vertical
      // and the (narrower, on tall panes) horizontal field of view, with slack
      // for the arm sweeping beyond its loaded pose.
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2
      const fitHeight = sphere.radius / Math.sin(halfFov)
      const fitWidth = fitHeight / Math.min(1, Math.max(camera.aspect, 0.1))
      const distance = Math.max(fitHeight, fitWidth) * 1.2
      controls.target.copy(sphere.center)
      camera.position
        .copy(sphere.center)
        .addScaledVector(new THREE.Vector3(1, 1, 0.75).normalize(), distance)
      camera.near = Math.max(0.005, distance / 200)
      camera.far = Math.max(50, distance * 20)
      camera.updateProjectionMatrix()
      controls.update()
      element.dataset.robotBounds = size
        .toArray()
        .map((value) => value.toFixed(3))
        .join(',')
      invalidate()
    }

    const buildGhost = () => {
      const source = robot.current
      if (!source) return
      if (ghostRobot.current) scene.remove(ghostRobot.current)
      const clone = source.clone(true) as URDFRobot
      clone.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.material = ghostMaterial
          object.castShadow = false
          object.receiveShadow = false
        }
      })
      clone.visible = false
      scene.add(clone)
      ghostRobot.current = clone
    }

    handles.current = { scene, floor, grid: null, ghostMaterial, fit, invalidate }

    const manager = new THREE.LoadingManager()
    // Meshes stream in after the URDF parses: draw each as it lands, then rebuild
    // the ghost and reframe once they all have.
    manager.onProgress = invalidate
    manager.onLoad = () => {
      buildGhost()
      fit()
      setLoadedRevision((revision) => revision + 1)
    }
    const loader = new URDFLoader(manager)
    loader.packages = assetsUrl
    loader.load(url, (model) => {
      const loaded = model as URDFRobot
      loaded.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true
          object.receiveShadow = true
        }
      })
      scene.add(loaded)
      robot.current = loaded
      buildGhost()
      fit()
      setLoadedRevision((revision) => revision + 1)
    })

    const resize = () => {
      const { clientWidth, clientHeight } = element
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / Math.max(1, clientHeight)
      camera.updateProjectionMatrix()
      invalidate()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    return () => {
      cancelAnimationFrame(frame)
      controls.removeEventListener('change', invalidate)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      ghostMaterial.dispose()
      renderer.domElement.remove()
      robot.current = null
      ghostRobot.current = null
      handles.current = null
    }
  }, [assetsUrl, url])

  useEffect(() => {
    const current = handles.current
    if (!current) return
    current.scene.background = new THREE.Color(cssColor('--viewer-bg', '#0f1217'))
    current.floor.material.color.set(cssColor('--viewer-floor', '#151920'))
    current.ghostMaterial.color.set(cssColor('--viewer-ghost', '#b9c2cf'))
    if (current.grid) {
      current.scene.remove(current.grid)
      current.grid.dispose()
    }
    current.grid = makeGrid()
    current.scene.add(current.grid)
    current.invalidate()
  }, [theme, url, assetsUrl])

  useEffect(() => {
    const target = robot.current
    if (!target) return
    const movable = Object.entries(target.joints)
      .filter(([, joint]) => joint.jointType !== 'fixed')
      .map(([name]) => name)
    const missing = resolveJointTargets(pose.jointNames, mapping).filter(
      ({ targetName }) => !target.joints[targetName],
    )
    if (missing.length > 0) {
      const example = { [missing[0].sourceName]: movable[0] ?? '<urdf_joint_name>' }
      setMappingError(
        `Unmapped: ${missing.map(({ sourceName }) => sourceName).join(', ')}. URDF joints: ${movable.join(', ') || '(none)'}. Add a joint map such as ${JSON.stringify(example)}.`,
      )
      return
    }
    setMappingError(null)
    applyPose(target, pose, mapping, angleUnit)
    const shadow = ghostRobot.current
    if (shadow) {
      shadow.visible = !!ghost
      if (ghost) applyPose(shadow, ghost, mapping, angleUnit)
    }
    handles.current?.invalidate()
  }, [pose, ghost, mapping, angleUnit, loadedRevision])

  return (
    <div className={styles.viewer} ref={host}>
      <button
        type="button"
        className={styles.reset}
        aria-label="Reset 3D view"
        title="Reset view"
        onClick={() => handles.current?.fit()}
      >
        <Crosshair size={14} />
      </button>
      <div className={styles.hint}>Drag to orbit · Scroll to zoom</div>
      {mappingError && (
        <div className={`error-banner ${styles.error}`} role="alert">
          <strong>Joint mapping error</strong>
          <span>{mappingError}</span>
        </div>
      )}
    </div>
  )
}
