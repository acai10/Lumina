import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { Box } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { createScene, disposeSceneGeometry } from '../../shared/three/sceneUtils'
import { useViewerStore } from '../../app/store/viewerSlice'

const HEMI_INTENSITY = 0.7
const DIR_KEY_COLOR = 0xffffff
const DIR_KEY_INTENSITY = 2.2
const DIR_FILL_INTENSITY = 0.7
const DIR_RIM_INTENSITY = 1.0
const EDGE_THRESHOLD_ANGLE = 20
const EDGE_OPACITY = 0.55
// Mesh surface finish.
const STL_METALNESS = 0.1
const STL_ROUGHNESS = 0.55
// Camera framing, expressed as multiples of the mesh's largest dimension (maxDim).
const CAMERA_FIT_DISTANCE = 1.8
const CAMERA_NEAR_FACTOR = 0.001
const CAMERA_FAR_FACTOR = 100

interface STLViewerProps {
    file: File
    onError?: (msg: string) => void
}

function addLights(scene: THREE.Scene): void {
    const hemi = new THREE.HemisphereLight(
        palette.hemiSkyHex,
        palette.hemiGroundHex,
        HEMI_INTENSITY,
    )
    scene.add(hemi)
    const key = new THREE.DirectionalLight(DIR_KEY_COLOR, DIR_KEY_INTENSITY)
    key.position.set(3, 4, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(palette.fillLightHex, DIR_FILL_INTENSITY)
    fill.position.set(-4, 1, 2)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(palette.rimLightHex, DIR_RIM_INTENSITY)
    rim.position.set(0, -2, -4)
    scene.add(rim)
}

export default function STLViewer({ file, onError }: STLViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    // Persistent canvas — reused across StrictMode mounts to avoid WebGL context limit.
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const meshRef = useRef<THREE.Mesh | null>(null)
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)

    const stlOpacity = useViewerStore((s) => s.stlOpacity)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(
            container,
            {
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.1,
                outputColorSpace: THREE.SRGBColorSpace,
            },
            canvasRef.current,
        )
        canvasRef.current = renderer.domElement

        addLights(scene)

        const loader = new STLLoader()
        const reader = new FileReader()

        reader.onload = (e) => {
            const result = e.target?.result
            if (!(result instanceof ArrayBuffer)) {
                onError?.('Failed to read file.')
                return
            }
            let geometry: THREE.BufferGeometry
            try {
                geometry = loader.parse(result)
            } catch (err) {
                console.error('STLViewer: failed to parse STL', err)
                onError?.(
                    'Could not parse STL file. The file may be corrupt or in an unsupported format.',
                )
                return
            }

            geometry.computeBoundingBox()
            geometry.computeVertexNormals()

            const box = geometry.boundingBox
            if (!box) return
            const center = new THREE.Vector3()
            box.getCenter(center)
            geometry.translate(-center.x, -center.y, -center.z)

            const size = new THREE.Vector3()
            box.getSize(size)
            const maxDim = Math.max(size.x, size.y, size.z)

            const material = new THREE.MeshStandardMaterial({
                color: palette.meshColorHex,
                metalness: STL_METALNESS,
                roughness: STL_ROUGHNESS,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: useViewerStore.getState().stlOpacity,
            })
            const mesh = new THREE.Mesh(geometry, material)
            scene.add(mesh)
            meshRef.current = mesh
            materialRef.current = material

            const boxHelper = new THREE.BoxHelper(mesh, new THREE.Color(palette.tealBorderHex))
            scene.add(boxHelper)

            const edges = new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_ANGLE)
            const edgeMat = new THREE.LineBasicMaterial({
                color: palette.edgeColorHex,
                transparent: true,
                opacity: EDGE_OPACITY,
            })
            const edgeLines = new THREE.LineSegments(edges, edgeMat)
            mesh.add(edgeLines)

            camera.position.set(0, 0, maxDim * CAMERA_FIT_DISTANCE)
            camera.near = maxDim * CAMERA_NEAR_FACTOR
            camera.far = maxDim * CAMERA_FAR_FACTOR
            camera.updateProjectionMatrix()
            controls.update()
        }

        reader.onerror = () => {
            console.error('STLViewer: FileReader error', reader.error)
            onError?.('Failed to read file.')
        }

        reader.readAsArrayBuffer(file)

        let animId: number
        const animate = () => {
            animId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        return () => {
            reader.abort()
            cancelAnimationFrame(animId)
            meshRef.current = null
            materialRef.current = null
            disposeSceneGeometry(scene)
            disposeBase()
        }
    }, [file, onError])

    useEffect(() => {
        if (materialRef.current) {
            materialRef.current.opacity = stlOpacity
            materialRef.current.needsUpdate = true
        }
    }, [stlOpacity])

    return <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
}
