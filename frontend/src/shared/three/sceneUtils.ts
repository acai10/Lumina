import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { palette } from '../theme/palette'

const MAX_DEVICE_PIXEL_RATIO = 1.5

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
    disposeBase: () => void
}

/**
 * Create a Three.js scene, camera, renderer, and OrbitControls attached to *container*.
 *
 * Pass *existingCanvas* to reuse an already-created HTMLCanvasElement (and therefore
 * its WebGL context) across React StrictMode double-mounts.  Each viewer component
 * keeps a `useRef<HTMLCanvasElement | null>(null)` that persists across the
 * StrictMode cleanup cycle; passing `ref.current` here avoids allocating a second
 * context on the remount, preventing the browser's "too many active WebGL contexts"
 * limit from being hit.
 *
 * disposeBase does NOT call `renderer.forceContextLoss()` — the canvas ref inside
 * the component keeps the context alive so it can be reused on the next mount.
 * The context is released by the browser's GC when the component truly unmounts and
 * the ref becomes unreachable.
 */
export function createScene(
    container: HTMLElement,
    options: SceneOptions = {},
    existingCanvas?: HTMLCanvasElement | null,
): SceneBundle {
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

    // When reusing an existing canvas the previous renderer may have left
    // UNPACK_FLIP_Y_WEBGL or UNPACK_PREMULTIPLY_ALPHA_WEBGL set to true.
    // WebGL2 forbids texImage3D while either flag is enabled, which causes
    // "INVALID_OPERATION: texImage3D: FLIP_Y or PREMULTIPLY_ALPHA isn't allowed"
    // during Three.js re-initialisation.  Reset both before creating the renderer.
    if (existingCanvas) {
        const gl = existingCanvas.getContext('webgl2') ?? existingCanvas.getContext('webgl')
        if (gl) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        }
    }

    const renderer = new THREE.WebGLRenderer({
        canvas: existingCanvas ?? undefined,
        antialias: window.devicePixelRatio < MAX_DEVICE_PIXEL_RATIO,
        powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO))
    renderer.setSize(w, h)
    renderer.setClearColor(palette.sceneBgHex)
    if (toneMapping !== undefined) renderer.toneMapping = toneMapping
    if (toneMappingExposure !== undefined) renderer.toneMappingExposure = toneMappingExposure
    if (outputColorSpace !== undefined) renderer.outputColorSpace = outputColorSpace

    if (!container.contains(renderer.domElement)) {
        container.appendChild(renderer.domElement)
    }

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
        // forceContextLoss is intentionally omitted — the caller's canvas ref keeps
        // the context alive so StrictMode remounts can reuse it.  The browser frees
        // the context via GC when the component truly unmounts and the ref drops.
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
                obj.material.forEach((m) => m.dispose())
            } else {
                obj.material.dispose()
            }
        }
    })
}
