import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { Box } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { createScene } from '../../shared/three/sceneUtils'
import { useViewerStore } from '../../app/store/viewerSlice'

interface STLViewerProps {
    file: File
    onError?: (msg: string) => void
}

function addLights(scene: THREE.Scene): void {
    const hemi = new THREE.HemisphereLight(0x4466cc, 0x001122, 0.7)
    scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3, 4, 5)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.7)
    fill.position.set(-4, 1, 2)
    scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffc080, 1.0)
    rim.position.set(0, -2, -4)
    scene.add(rim)
}

export default function STLViewer({ file, onError }: STLViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const meshRef = useRef<THREE.Mesh | null>(null)
    const materialRef = useRef<THREE.MeshStandardMaterial | null>(null)

    const { stlOpacity } = useViewerStore()

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(container, {
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
            outputColorSpace: THREE.SRGBColorSpace,
        })

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
                metalness: 0.1,
                roughness: 0.55,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: useViewerStore.getState().stlOpacity,
            })
            const mesh = new THREE.Mesh(geometry, material)
            scene.add(mesh)
            meshRef.current = mesh
            materialRef.current = material

            const boxHelper = new THREE.BoxHelper(mesh, new THREE.Color(0x64ffc8))
            scene.add(boxHelper)

            const edges = new THREE.EdgesGeometry(geometry, 20)
            const edgeMat = new THREE.LineBasicMaterial({
                color: palette.edgeColorHex,
                transparent: true,
                opacity: 0.55,
            })
            const edgeLines = new THREE.LineSegments(edges, edgeMat)
            mesh.add(edgeLines)

            camera.position.set(0, 0, maxDim * 1.8)
            camera.near = maxDim * 0.001
            camera.far = maxDim * 100
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
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
                    obj.geometry.dispose()
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
                    else obj.material.dispose()
                }
            })
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
