import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Box } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import SliceSlider from './SliceSlider'
import { createScene } from '../../shared/three/sceneUtils'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5ViewerProps {
    slices: Uint8Array[]
    meta: H5Meta
    fileKey: string
    onError?: (msg: string) => void
}

const PLANE_OPACITY_ALL = 0.1
const PLANE_OPACITY_SELECTED = 0.9

function buildSlicePlanes(
    slices: Uint8Array[],
    volW: number,
    volH: number,
    totalDepth: number,
    scene: THREE.Scene,
): { planes: THREE.Mesh[]; textures: THREE.DataTexture[] } {
    const planes: THREE.Mesh[] = []
    const textures: THREE.DataTexture[] = []
    const n = slices.length
    for (let i = 0; i < n; i++) {
        const texture = new THREE.DataTexture(slices[i], volW, volH, THREE.RGBAFormat)
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

export default function H5Viewer({ slices, meta, fileKey }: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const planesRef = useRef<THREE.Mesh[]>([])
    const { currentSliceIndex } = useViewerStore()

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(container)

        const { width: volW, height: volH } = meta
        const totalDepth = volH * 0.8

        const { planes, textures } = buildSlicePlanes(slices, volW, volH, totalDepth, scene)
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

        let animId: number
        const animate = () => {
            animId = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        return () => {
            cancelAnimationFrame(animId)
            useViewerStore.getState().saveH5CameraState(fileKey, {
                cameraPosition: camera.position.toArray() as [number, number, number],
                cameraQuaternion: camera.quaternion.toArray() as [number, number, number, number],
                controlsTarget: controls.target.toArray() as [number, number, number],
            })
            planesRef.current = []
            planes.forEach((p) => {
                ;(p.material as THREE.MeshBasicMaterial).dispose()
                p.geometry.dispose()
            })
            textures.forEach((t) => t.dispose())
            disposeBase()
        }
    }, [slices, meta, fileKey])

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
