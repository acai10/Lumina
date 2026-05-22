import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Box } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import SliceSlider from './SliceSlider'
import { createScene } from '../../shared/three/sceneUtils'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5ViewerProps {
    slices: Float32Array[]
    sliceMinMax: [number, number][]
    meta: H5Meta
    fileKey: string
    onError?: (msg: string) => void
}

const PLANE_OPACITY_ALL = 0.1
const PLANE_OPACITY_SELECTED = 0.9

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform sampler2D uTexture;
uniform float uMin;
uniform float uMax;
uniform float uOpacity;
varying vec2 vUv;
void main() {
    float v = texture2D(uTexture, vUv).r;
    float n = clamp((uMax > uMin) ? (v - uMin) / (uMax - uMin) : 0.0, 0.0, 1.0);
    gl_FragColor = vec4(n, n, n, uOpacity);
}
`

function buildSlicePlanes(
    slices: Float32Array[],
    sliceMinMax: [number, number][],
    volW: number,
    volH: number,
    totalDepth: number,
    scene: THREE.Scene,
): { planes: THREE.Mesh[]; textures: THREE.DataTexture[] } {
    const planes: THREE.Mesh[] = []
    const textures: THREE.DataTexture[] = []
    const n = slices.length
    for (let i = 0; i < n; i++) {
        const texture = new THREE.DataTexture(
            slices[i],
            volW,
            volH,
            THREE.RedFormat,
            THREE.FloatType,
        )
        texture.needsUpdate = true
        textures.push(texture)
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uMin: { value: sliceMinMax[i][0] },
                uMax: { value: sliceMinMax[i][1] },
                uOpacity: { value: PLANE_OPACITY_ALL },
            },
            vertexShader,
            fragmentShader,
            transparent: true,
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

export default function H5Viewer({ slices, sliceMinMax, meta, fileKey }: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const planesRef = useRef<THREE.Mesh[]>([])
    const { currentSliceIndex } = useViewerStore()

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(container)

        const { width: volW, height: volH } = meta
        const totalDepth = volH * 0.8

        const { planes, textures } = buildSlicePlanes(
            slices,
            sliceMinMax,
            volW,
            volH,
            totalDepth,
            scene,
        )
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
                ;(p.material as THREE.ShaderMaterial).dispose()
                p.geometry.dispose()
            })
            textures.forEach((t) => t.dispose())
            disposeBase()
        }
    }, [slices, sliceMinMax, meta, fileKey])

    // Update plane opacities when slice selection changes
    useEffect(() => {
        const planes = planesRef.current
        if (planes.length === 0) return

        planes.forEach((p, i) => {
            const mat = p.material as THREE.ShaderMaterial
            if (currentSliceIndex === null) {
                p.visible = true
                mat.uniforms.uOpacity.value = PLANE_OPACITY_ALL
            } else if (i === currentSliceIndex) {
                p.visible = true
                mat.uniforms.uOpacity.value = PLANE_OPACITY_SELECTED
            } else if (i > currentSliceIndex) {
                p.visible = true
                mat.uniforms.uOpacity.value = PLANE_OPACITY_ALL
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
