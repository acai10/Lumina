import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { palette } from '../theme/palette'

export interface SceneOptions {
    fov?: number
    near?: number
    far?: number
    toneMapping?: THREE.ToneMapping
    toneMappingExposure?: number
    outputColorSpace?: THREE.ColorSpace
}

export interface SceneBundle {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    controls: OrbitControls
    /** Removes the resize listener, disposes controls + renderer, removes canvas from container. */
    disposeBase: () => void
}

export function createScene(container: HTMLElement, options: SceneOptions = {}): SceneBundle {
    const {
        fov = 45,
        near = 0.1,
        far = 1e6,
        toneMapping,
        toneMappingExposure,
        outputColorSpace,
    } = options

    const w = container.clientWidth
    const h = container.clientHeight

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(fov, w / h, near, far)

    const renderer = new THREE.WebGLRenderer({
        antialias: window.devicePixelRatio < 1.5,
        powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(w, h)
    renderer.setClearColor(palette.bgDeepHex)
    if (toneMapping !== undefined) renderer.toneMapping = toneMapping
    if (toneMappingExposure !== undefined) renderer.toneMappingExposure = toneMappingExposure
    if (outputColorSpace !== undefined) renderer.outputColorSpace = outputColorSpace
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.15

    const handleResize = () => {
        const rw = container.clientWidth
        const rh = container.clientHeight
        camera.aspect = rw / rh
        camera.updateProjectionMatrix()
        renderer.setSize(rw, rh)
    }
    window.addEventListener('resize', handleResize)

    const disposeBase = () => {
        window.removeEventListener('resize', handleResize)
        controls.dispose()
        renderer.forceContextLoss()
        renderer.dispose()
        if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement)
        }
    }

    return { scene, camera, renderer, controls, disposeBase }
}

export function disposeSceneGeometry(scene: THREE.Scene): void {
    scene.traverse((obj) => {
        if (
            obj instanceof THREE.Mesh ||
            obj instanceof THREE.LineSegments ||
            obj instanceof THREE.Points
        ) {
            obj.geometry.dispose()
            if (Array.isArray(obj.material)) {
                obj.material.forEach((m: THREE.Material) => m.dispose())
            } else {
                ;(obj.material as THREE.Material).dispose()
            }
        }
    })
}
