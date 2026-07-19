import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import URDFLoader from 'urdf-loader'

import { convertJointValue, resolveJointTargets } from '../robotJoints'

interface URDFRobot extends THREE.Object3D {
  joints: Record<string, { setJointValue: (value: number) => void; jointType: string }>
}

interface Props {
  url: string
  values: number[]
  jointNames: string[]
  mapping: Record<string, string>
  angleUnit: 'degrees' | 'radians'
  mode: 'dataset' | 'inference'
}

export function RobotViewer({ url, values, jointNames, mapping, angleUnit, mode }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const robot = useRef<URDFRobot | null>(null)
  const [loadedJoints, setLoadedJoints] = useState(0)
  const [mappingError, setMappingError] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return
    const element = host.current
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#e5e3db')
    scene.fog = new THREE.Fog('#e5e3db', 12, 30)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50)
    camera.up.set(0, 0, 1)
    camera.position.set(1.6, 1.6, 1.25)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    element.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0.48)
    controls.enableDamping = true
    controls.minDistance = 0.6
    controls.maxDistance = 5

    scene.add(new THREE.HemisphereLight('#ffffff', '#79776f', 2.4))
    const key = new THREE.DirectionalLight('#fff4df', 3)
    key.position.set(2, 3, 2)
    key.castShadow = true
    scene.add(key)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.3, 64),
      new THREE.MeshStandardMaterial({ color: '#cbc8bf', roughness: 0.95 }),
    )
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(4, 20, '#aba9a1', '#d4d1c9')
    grid.rotation.x = Math.PI / 2
    grid.position.z = 0.001
    scene.add(grid)

    const loader = new URDFLoader()
    loader.packages = `${window.location.origin}/api/sessions/${url.split('/')[3]}/assets`
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
      setLoadedJoints(Object.keys(loaded.joints).length)
      loaded.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(loaded)
      if (!bounds.isEmpty()) {
        const center = bounds.getCenter(new THREE.Vector3())
        const size = bounds.getSize(new THREE.Vector3())
        const radius = Math.max(size.x, size.y, size.z, 0.4)
        controls.target.copy(center)
        camera.position
          .copy(center)
          .add(new THREE.Vector3(radius * 1.3, radius * 1.3, radius * 0.9))
        camera.near = Math.max(0.005, radius / 100)
        camera.far = Math.max(50, radius * 20)
        camera.updateProjectionMatrix()
        camera.lookAt(center)
        controls.update()
        element.dataset.robotBounds = size
          .toArray()
          .map((value) => value.toFixed(3))
          .join(',')
        element.dataset.robotCenter = center
          .toArray()
          .map((value) => value.toFixed(3))
          .join(',')
        element.dataset.cameraPosition = camera.position
          .toArray()
          .map((value) => value.toFixed(3))
          .join(',')
      }
    })

    const resize = () => {
      const { clientWidth, clientHeight } = element
      renderer.setSize(clientWidth, clientHeight)
      camera.aspect = clientWidth / Math.max(1, clientHeight)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    let animation = 0
    const render = () => {
      controls.update()
      renderer.render(scene, camera)
      animation = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(animation)
      observer.disconnect()
      controls.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      robot.current = null
    }
  }, [url])

  useEffect(() => {
    const target = robot.current
    if (!target) return
    const movable = Object.entries(target.joints)
      .filter(([, joint]) => joint.jointType !== 'fixed')
      .map(([name]) => name)
    const resolutions = resolveJointTargets(jointNames, mapping)
    const missing = resolutions.filter(({ targetName }) => !target.joints[targetName])
    if (missing.length > 0) {
      const example = { [missing[0].sourceName]: movable[0] ?? '<urdf_joint_name>' }
      setMappingError(
        `Unmapped: ${missing.map(({ sourceName }) => sourceName).join(', ')}. URDF joints: ${movable.join(', ') || '(none)'}. Joint Map example: ${JSON.stringify(example)} (verify the pairing).`,
      )
      return
    }
    setMappingError(null)
    values.forEach((value, index) => {
      const targetName = resolutions[index]?.targetName
      const joint = targetName ? target.joints[targetName] : undefined
      if (!joint || !Number.isFinite(value)) return
      const convertedValue = convertJointValue(value, angleUnit, joint.jointType)
      joint.setJointValue(convertedValue)
    })
  }, [values, jointNames, mapping, angleUnit, loadedJoints])

  return (
    <div className="viewer" ref={host}>
      <div className={`viewer-mode ${mode}`}>
        <span /> {mode === 'inference' ? 'POLICY OUTPUT' : 'DATASET ACTION'}
      </div>
      <div className="viewer-hint">Drag to orbit · Scroll to zoom</div>
      {mappingError && (
        <div className="viewer-error">
          <strong>JOINT MAPPING ERROR</strong>
          <span>{mappingError}</span>
        </div>
      )}
      <div className="axis-mark">
        <i />Z
      </div>
    </div>
  )
}
