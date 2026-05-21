import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import SliceSlider from './SliceSlider'
import { palette } from '../../shared/theme/palette'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5ViewerProps {
    slices: string[]
    meta: H5Meta
    fileKey: string
    onError?: (msg: string) => void
}

const PLANE_OPACITY_ALL = 0.1
const PLANE_OPACITY_SELECTED = 0.9

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load slice: ${src.slice(0, 40)}`))
        img.src = src
    })
}

function buildScene(container: HTMLDivElement): {
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    scene: THREE.Scene
    controls: OrbitControls
} {
    const width = container.clientWidth
    const height = container.clientHeight
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1e6)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    renderer.setClearColor(palette.bgDeepHex)
    container.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    return { renderer, camera, scene, controls }
}

function buildSlicePlanes(
    images: HTMLImageElement[],
    volW: number,
    volH: number,
    totalDepth: number,
    scene: THREE.Scene,
): { planes: THREE.Mesh[]; textures: THREE.Texture[] } {
    const planes: THREE.Mesh[] = []
    const textures: THREE.Texture[] = []
    const n = images.length
    for (let i = 0; i < n; i++) {
        const texture = new THREE.Texture(images[i])
        texture.needsUpdate = true
        textures.push(texture)
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: PLANE_OPACITY_ALL,
            depthWrite: false,
            side: THREE.DoubleSide,
        })
        const geometry = new THREE.PlaneGeometry(volW, volH)
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = Math.PI / 2
        mesh.position.y = (0.5 - (n > 1 ? i / (n - 1) : 0)) * totalDepth
        scene.add(mesh)
        planes.push(mesh)
    }
    return { planes, textures }
}

export default function H5Viewer({ slices, meta, fileKey, onError }: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const planesRef = useRef<THREE.Mesh[]>([])
    const { currentSliceIndex } = useViewerStore()

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { renderer, camera, scene, controls } = buildScene(container)

        const { width: volW, height: volH } = meta
        const totalDepth = volH * 0.8

        let planes: THREE.Mesh[] = []
        let textures: THREE.Texture[] = []
        let cancelled = false
        let sceneReady = false

        const buildPlanes = async () => {
            let images: HTMLImageElement[]
            try {
                images = await Promise.all(slices.map(loadImage))
            } catch (err) {
                console.error('H5Viewer: failed to load slice images', err)
                onError?.('Failed to load H5 slices.')
                return
            }
            if (cancelled) return
            ;({ planes, textures } = buildSlicePlanes(images, volW, volH, totalDepth, scene))
            planesRef.current = planes

            const maxDim = Math.max(volW, volH, totalDepth)
            const saved = useViewerStore.getState().h5PerFileStates[fileKey]
            if (saved) {
                camera.position.fromArray(saved.cameraPosition)
                camera.quaternion.fromArray(saved.cameraQuaternion)
                controls.target.fromArray(saved.controlsTarget)
            } else {
                camera.position.set(0, maxDim * 1.8, maxDim * 0.4)
                camera.lookAt(0, 0, 0)
            }
            camera.near = maxDim * 0.001
            camera.far = maxDim * 100
            camera.updateProjectionMatrix()
            controls.update()
            sceneReady = true
        }

        buildPlanes()

        let animId: number
        const animate = () => {
            animId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        const handleResize = () => {
            const w = container.clientWidth
            const h = container.clientHeight
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h)
        }
        window.addEventListener('resize', handleResize)

        return () => {
            cancelled = true
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', handleResize)
            if (sceneReady) {
                useViewerStore.getState().saveH5CameraState(fileKey, {
                    cameraPosition: camera.position.toArray() as [number, number, number],
                    cameraQuaternion: camera.quaternion.toArray() as [
                        number,
                        number,
                        number,
                        number,
                    ],
                    controlsTarget: controls.target.toArray() as [number, number, number],
                })
            }
            controls.dispose()
            planesRef.current = []
            planes.forEach((p) => {
                ;(p.material as THREE.MeshBasicMaterial).dispose()
                p.geometry.dispose()
            })
            textures.forEach((t) => t.dispose())
            renderer.dispose()
            container.removeChild(renderer.domElement)
        }
    }, [slices, meta, onError, fileKey])

    // Update plane opacities when slice selection changes
    useEffect(() => {
        const planes = planesRef.current
        if (planes.length === 0) return

        planes.forEach((p, i) => {
            const mat = p.material as THREE.MeshBasicMaterial
            if (currentSliceIndex === null) {
                p.visible = true
                mat.opacity = PLANE_OPACITY_ALL
            } else if (i === currentSliceIndex) {
                p.visible = true
                mat.opacity = PLANE_OPACITY_SELECTED
            } else if (i > currentSliceIndex) {
                p.visible = true
                mat.opacity = PLANE_OPACITY_ALL
            } else {
                p.visible = false
            }
        })
    }, [currentSliceIndex])

    return (
        <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
            <SliceSlider nSlices={meta.nSlices} />
        </Box>
    )
}
