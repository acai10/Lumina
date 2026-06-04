import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { Box } from '@mui/material'
import { useViewerStore, defaultRenderControls } from '../../app/store/viewerSlice'
import { createScene, disposeSceneGeometry } from '../../shared/three/sceneUtils'
import { palette } from '../../shared/theme/palette'
import type { H5Meta } from '../../shared/types/viewer.types'
import { createAxisLabels } from './createAxisLabels'
import { vertexShader, fragmentShader } from './h5ViewerShaders'
import { applyDrawRanges } from './h5DrawUtils'

// Firefox caps drawArraysInstanced at 30 M vertices per draw call; leave headroom
const MAX_VERTS_PER_DRAW = 28_000_000

interface H5ViewerProps {
    vIndices: Float32Array
    vIntensities: Float32Array
    meta: H5Meta
    fileKey: string
    stlOverlayFile?: File
    onError?: (msg: string) => void
}

export default function H5Viewer({
    vIndices,
    vIntensities,
    meta,
    fileKey,
    stlOverlayFile,
}: H5ViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    // Persistent canvas survives StrictMode cleanup so the same WebGL context is
    // reused on remount — prevents "too many active WebGL contexts" browser errors.
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const materialRef = useRef<THREE.ShaderMaterial | null>(null)
    const chunkGeosRef = useRef<THREE.BufferGeometry[]>([])
    const needsRenderRef = useRef(true)
    const sceneRef = useRef<THREE.Scene | null>(null)
    // The green bounding box; its Y extent tracks the current volume spacing.
    const boxHelperRef = useRef<THREE.Box3Helper | null>(null)

    const renderControls = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.renderControls ?? defaultRenderControls,
    )

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const { scene, camera, renderer, controls, disposeBase } = createScene(
            container,
            {},
            canvasRef.current,
        )
        canvasRef.current = renderer.domElement
        sceneRef.current = scene

        const { nSlices, height, width } = meta
        const initialRc =
            useViewerStore.getState().h5PerFileStates[fileKey]?.renderControls ??
            defaultRenderControls
        const maxDim = Math.max(width, height, initialRc.volumeSpacing)

        const axes = new THREE.AxesHelper(maxDim * 0.7)
        scene.add(axes)

        const axisLen = maxDim * 0.78
        const labelScale = maxDim * 0.09
        const axisLabels = createAxisLabels(scene, axisLen, labelScale)

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uNSlices: { value: nSlices },
                uHeight: { value: height },
                uWidth: { value: width },
                uVolumeSpacing: { value: initialRc.volumeSpacing },
                uPointSize: { value: initialRc.h5PointSize },
                uThreshold: { value: initialRc.h5Threshold },
                uBrightness: { value: initialRc.h5Brightness },
                uContrast: { value: initialRc.h5Contrast },
                uOpacity: { value: initialRc.h5Opacity },
                uSliceMin: { value: initialRc.h5SliceRange[0] },
                uSliceMax: { value: initialRc.h5SliceRange[1] },
                uWidthMin: { value: initialRc.h5WidthRange[0] },
                uWidthMax: { value: initialRc.h5WidthRange[1] },
                uHeightMin: { value: initialRc.h5HeightRange[0] },
                uHeightMax: { value: initialRc.h5HeightRange[1] },
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            depthWrite: false,
        })

        const boundingBox = new THREE.Box3(
            new THREE.Vector3(-width / 2, -initialRc.volumeSpacing / 2, -height / 2),
            new THREE.Vector3(width / 2, initialRc.volumeSpacing / 2, height / 2),
        )
        const boxHelper = new THREE.Box3Helper(boundingBox, new THREE.Color(palette.tealBorderHex))
        scene.add(boxHelper)
        boxHelperRef.current = boxHelper

        chunkGeosRef.current = []
        for (let offset = 0; offset < vIndices.length; offset += MAX_VERTS_PER_DRAW) {
            const count = Math.min(MAX_VERTS_PER_DRAW, vIndices.length - offset)
            const geo = new THREE.BufferGeometry()
            geo.setAttribute(
                'vIndex',
                new THREE.BufferAttribute(vIndices.subarray(offset, offset + count), 1),
            )
            geo.setAttribute(
                'vIntensity',
                new THREE.BufferAttribute(vIntensities.subarray(offset, offset + count), 1),
            )
            const chunk = new THREE.Points(geo, material)
            chunk.frustumCulled = false
            scene.add(chunk)
            chunkGeosRef.current.push(geo)
        }
        applyDrawRanges(chunkGeosRef.current, vIntensities, initialRc.h5Threshold)
        materialRef.current = material

        const saved = useViewerStore.getState().h5PerFileStates[fileKey]
        if (saved?.cameraPosition && saved.cameraQuaternion && saved.controlsTarget) {
            camera.position.fromArray(saved.cameraPosition)
            camera.quaternion.fromArray(saved.cameraQuaternion)
            controls.target.fromArray(saved.controlsTarget)
        } else {
            camera.position.set(maxDim * 0.5, maxDim * 1.5, maxDim * 1.2)
            camera.lookAt(0, 0, 0)
        }
        camera.near = maxDim * 0.001
        camera.far = maxDim * 100
        camera.updateProjectionMatrix()
        controls.update()

        // OrbitControls.update() can return false for sub-EPS scroll increments (trackpad);
        // this listener guarantees one render after every wheel event regardless.
        const onWheel = () => {
            needsRenderRef.current = true
        }
        renderer.domElement.addEventListener('wheel', onWheel, { passive: true })

        needsRenderRef.current = true
        let animId: number
        const animate = () => {
            animId = requestAnimationFrame(animate)
            const changed = controls.update()
            if (changed || needsRenderRef.current) {
                renderer.render(scene, camera)
                needsRenderRef.current = false
            }
        }
        animate()

        return () => {
            renderer.domElement.removeEventListener('wheel', onWheel)
            cancelAnimationFrame(animId)
            useViewerStore.getState().saveH5CameraState(fileKey, {
                cameraPosition: camera.position.toArray() as [number, number, number],
                cameraQuaternion: camera.quaternion.toArray() as [number, number, number, number],
                controlsTarget: controls.target.toArray() as [number, number, number],
            })
            axisLabels.forEach((sprite) => {
                sprite.material.map?.dispose()
                sprite.material.dispose()
            })
            materialRef.current = null
            chunkGeosRef.current = []
            boxHelperRef.current = null
            sceneRef.current = null
            disposeSceneGeometry(scene)
            disposeBase()
        }
    }, [vIndices, vIntensities, meta, fileKey])

    // STL overlay — loads the mesh into the existing H5 scene whenever the file changes.
    useEffect(() => {
        const scene = sceneRef.current
        if (!scene) return

        const stlMeshGroup = new THREE.Group()
        const lights: THREE.Light[] = []

        if (stlOverlayFile) {
            const loader = new STLLoader()
            const reader = new FileReader()
            reader.onload = (e) => {
                if (!(e.target?.result instanceof ArrayBuffer)) return
                const geo = loader.parse(e.target.result)
                geo.computeVertexNormals()
                geo.computeBoundingBox()
                const center = new THREE.Vector3()
                geo.boundingBox!.getCenter(center)
                geo.translate(-center.x, -center.y, -center.z)

                const mat = new THREE.MeshStandardMaterial({
                    color: 0x88aaff,
                    transparent: true,
                    opacity: 0.4,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                })
                stlMeshGroup.add(new THREE.Mesh(geo, mat))
                scene.add(stlMeshGroup)

                const ambient = new THREE.AmbientLight(0xffffff, 0.6)
                const dir = new THREE.DirectionalLight(0xffffff, 1.2)
                dir.position.set(1, 2, 3)
                lights.push(ambient, dir)
                lights.forEach((l) => scene.add(l))
                needsRenderRef.current = true
            }
            reader.readAsArrayBuffer(stlOverlayFile)
        }

        return () => {
            stlMeshGroup.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose()
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach((m) => m.dispose())
                    } else {
                        obj.material.dispose()
                    }
                }
            })
            scene.remove(stlMeshGroup)
            lights.forEach((l) => scene.remove(l))
            if (needsRenderRef.current !== undefined) needsRenderRef.current = true
        }
    }, [stlOverlayFile])

    const {
        volumeSpacing,
        h5PointSize,
        h5Threshold,
        h5Brightness,
        h5Contrast,
        h5Opacity,
        h5SliceRange,
        h5WidthRange,
        h5HeightRange,
    } = renderControls
    const [sliceMin, sliceMax] = h5SliceRange
    const [widthMin, widthMax] = h5WidthRange
    const [heightMin, heightMax] = h5HeightRange

    // Threshold update runs applyDrawRanges (O(n) binary search) — keep isolated so
    // adjusting other uniforms does not trigger the expensive draw-range recalculation.
    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uThreshold.value = h5Threshold
        applyDrawRanges(chunkGeosRef.current, vIntensities, h5Threshold)
        needsRenderRef.current = true
    }, [h5Threshold, vIntensities])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uVolumeSpacing.value = volumeSpacing
        // Keep the green bounding box in sync with the model's Y extent, which the
        // vertex shader scales to ±volumeSpacing/2.
        const boxHelper = boxHelperRef.current
        if (boxHelper) {
            boxHelper.box.min.y = -volumeSpacing / 2
            boxHelper.box.max.y = volumeSpacing / 2
        }
        mat.uniforms.uPointSize.value = h5PointSize
        mat.uniforms.uBrightness.value = h5Brightness
        mat.uniforms.uContrast.value = h5Contrast
        mat.uniforms.uOpacity.value = h5Opacity
        mat.uniforms.uSliceMin.value = sliceMin
        mat.uniforms.uSliceMax.value = sliceMax
        mat.uniforms.uWidthMin.value = widthMin
        mat.uniforms.uWidthMax.value = widthMax
        mat.uniforms.uHeightMin.value = heightMin
        mat.uniforms.uHeightMax.value = heightMax
        needsRenderRef.current = true
    }, [
        volumeSpacing,
        h5PointSize,
        h5Brightness,
        h5Contrast,
        h5Opacity,
        sliceMin,
        sliceMax,
        widthMin,
        widthMax,
        heightMin,
        heightMax,
    ])

    return <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
}
