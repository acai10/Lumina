// CHANGED: renderer.setClearColor uses palette.bgDeepHex — same color as H5Viewer
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box } from '@mui/material'
import { palette } from '../../shared/theme/palette'

interface STLViewerProps {
    file: File
    onError?: (msg: string) => void
}

export default function STLViewer({ file, onError }: STLViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const width = container.clientWidth
        const height = container.clientHeight

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1e7)
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(width, height)
        renderer.setClearColor(palette.bgDeepHex)
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.1
        renderer.outputColorSpace = THREE.SRGBColorSpace
        container.appendChild(renderer.domElement)

        // Soft ambient fill — cool sky, dark ground
        const hemi = new THREE.HemisphereLight(0x4466cc, 0x001122, 0.7)
        scene.add(hemi)
        // Key light — strong, front-right-top
        const key = new THREE.DirectionalLight(0xffffff, 2.2)
        key.position.set(3, 4, 5)
        scene.add(key)
        // Fill light — left side, softer
        const fill = new THREE.DirectionalLight(0xaaccff, 0.7)
        fill.position.set(-4, 1, 2)
        scene.add(fill)
        // Rim light — warm, from behind for edge pop
        const rim = new THREE.DirectionalLight(0xffc080, 1.0)
        rim.position.set(0, -2, -4)
        scene.add(rim)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05

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
                color: 0x4477bb,
                metalness: 0.1,
                roughness: 0.55,
                side: THREE.DoubleSide,
            })
            const mesh = new THREE.Mesh(geometry, material)
            scene.add(mesh)

            // Edge overlay — draws contour lines along every hard edge (spiral, text, plate rim).
            // Threshold 20°: only edges where adjacent faces meet at ≥20° get a line,
            // so smooth curved surfaces stay clean but raised feature boundaries are visible.
            const edges = new THREE.EdgesGeometry(geometry, 20)
            const edgeMat = new THREE.LineBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.55,
            })
            const edgeLines = new THREE.LineSegments(edges, edgeMat)
            scene.add(edgeLines)

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

        const handleResize = () => {
            const w = container.clientWidth
            const h = container.clientHeight
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h)
        }
        window.addEventListener('resize', handleResize)

        return () => {
            reader.abort()
            cancelAnimationFrame(animId)
            window.removeEventListener('resize', handleResize)
            controls.dispose()
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
                    obj.geometry.dispose()
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
                    else obj.material.dispose()
                }
            })
            renderer.dispose()
            container.removeChild(renderer.domElement)
        }
    }, [file, onError])

    return <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
}
