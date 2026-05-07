import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import SliceSlider from './SliceSlider'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5ViewerProps {
    slices: string[]
    meta: H5Meta
}

const PLANE_OPACITY_ALL = 0.09
const PLANE_OPACITY_SELECTED = 0.9
const PLANE_OPACITY_FADED = 0.03

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error(`Failed to load slice: ${src.slice(0, 40)}`))
        img.src = src
    })
}

export default function H5Viewer({ slices, meta }: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const planesRef = useRef<THREE.Mesh[]>([])
    const { currentSliceIndex } = useViewerStore()

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const width = container.clientWidth
        const height = container.clientHeight

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1e6)
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(width, height)
        renderer.setClearColor(0x0a0f1e)
        container.appendChild(renderer.domElement)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05

        const { nSlices: n_slices, width: volW, height: volH } = meta
        const totalDepth = volH * 0.8

        const planes: THREE.Mesh[] = []
        const textures: THREE.Texture[] = []
        let cancelled = false

        const buildPlanes = async () => {
            let images: HTMLImageElement[]
            try {
                images = await Promise.all(slices.map(loadImage))
            } catch (err) {
                console.error('H5Viewer: failed to load slice images', err)
                return
            }
            if (cancelled) return

            for (let i = 0; i < n_slices; i++) {
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
                mesh.position.z = ((n_slices > 1 ? i / (n_slices - 1) : 0) - 0.5) * totalDepth
                scene.add(mesh)
                planes.push(mesh)
            }

            planesRef.current = planes

            const maxDim = Math.max(volW, volH, totalDepth)
            camera.position.set(0, 0, maxDim * 1.8)
            camera.near = maxDim * 0.001
            camera.far = maxDim * 100
            camera.updateProjectionMatrix()
            controls.update()
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
    }, [slices, meta])

    // Update plane opacities when slice selection changes
    useEffect(() => {
        const planes = planesRef.current
        if (planes.length === 0) return

        planes.forEach((p, i) => {
            const mat = p.material as THREE.MeshBasicMaterial
            if (currentSliceIndex === null) {
                mat.opacity = PLANE_OPACITY_ALL
            } else if (i === currentSliceIndex) {
                mat.opacity = PLANE_OPACITY_SELECTED
            } else {
                mat.opacity = PLANE_OPACITY_FADED
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
