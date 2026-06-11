import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Box } from '@mui/material'
import { useViewerStore, defaultRenderControls } from '../../app/store/viewerSlice'
import { createScene, disposeSceneGeometry } from '../../shared/three/sceneUtils'
import { palette } from '../../shared/theme/palette'
import { ZoomModeButton } from '../../shared/components'
import type { H5Meta } from '../../shared/types/viewer.types'
import { createAxisLabels, createAxisTickLabels } from './createAxisLabels'
import { DEFAULT_VOXEL_SIZE_UM } from '../../shared/constants'
import { vertexShader, fragmentShader } from './h5ViewerShaders'
import { applyDrawRanges, countAboveThreshold } from './h5DrawUtils'

// Firefox caps drawArraysInstanced at 30 M vertices per draw call; leave headroom
const MAX_VERTS_PER_DRAW = 28_000_000

// Stable fallback constants — inline `?? [0,1]` creates a new array every render
// and breaks Zustand's snapshot cache check, causing an infinite re-render loop.
const DEFAULT_COLORMAP_RANGE: [number, number] = [0, 1]

// Percentiles used to build the auto-fit colour window. Above-threshold OCT
// intensities are heavily skewed toward the top, so a plain min/max window maps
// almost everything onto the hot end of the colormap and looks near-monochrome.
// Clipping the top/bottom tails and stretching the bulk gives a visible gradient
// (a standard contrast-stretch, like clim percentiles in imaging tools).
const COLOR_WINDOW_LOW_PCT = 0.02
const COLOR_WINDOW_HIGH_PCT = 0.98

// Robust colour window over the voxels currently visible (>= threshold). vIntensities
// is sorted DESCENDING, so high values sit at low indices: the high-percentile (ceil)
// is near index 0 and the low-percentile (floor) is near the end of the visible range.
// Falls back to [threshold, 1] when nothing is visible.
function visibleIntensityWindow(vIntensities: Float32Array, threshold: number): [number, number] {
    const total = countAboveThreshold(vIntensities, threshold)
    if (total === 0 || vIntensities.length === 0) return [threshold, 1]
    const hiIdx = Math.min(total - 1, Math.floor((1 - COLOR_WINDOW_HIGH_PCT) * total))
    const loIdx = Math.min(total - 1, Math.floor((1 - COLOR_WINDOW_LOW_PCT) * total))
    const ceil = vIntensities[hiIdx]
    const floor = vIntensities[loIdx]
    // Guard against a degenerate zero-width window (all visible voxels identical).
    return floor < ceil ? [floor, ceil] : [floor, floor + 0.001]
}

// STL overlay appearance: a semi-transparent blue mesh lit by its own ambient + key light.
const STL_OVERLAY_COLOR = 0x88aaff
const STL_OVERLAY_OPACITY = 0.4
const STL_OVERLAY_LIGHT_COLOR = 0xffffff
const STL_OVERLAY_AMBIENT_INTENSITY = 0.6
const STL_OVERLAY_DIR_INTENSITY = 1.2
const STL_OVERLAY_DIR_POSITION: [number, number, number] = [1, 2, 3]

// Scene framing, expressed as multiples of the volume's largest dimension (maxDim).
const AXES_HELPER_SCALE = 0.7
const AXIS_LABEL_LENGTH_SCALE = 0.78
const AXIS_LABEL_SIZE_SCALE = 0.09
const CAMERA_START_OFFSET: [number, number, number] = [0.5, 1.5, 1.2]
const CAMERA_NEAR_FACTOR = 0.001
const CAMERA_FAR_FACTOR = 100

interface H5ViewerProps {
    vIndices: Float32Array
    vIntensities: Float32Array
    meta: H5Meta
    fileKey: string
    stlOverlayFile?: File
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
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<OrbitControls | null>(null)
    const maxDimRef = useRef(0)

    const renderControls = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.renderControls ?? defaultRenderControls,
    )
    const sliceColormap = useViewerStore((s) => s.h5PerFileStates[fileKey]?.sliceColormap ?? 'gray')
    const colormapRange = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.sliceColormapRange ?? DEFAULT_COLORMAP_RANGE,
    )
    const colorByDepth = useViewerStore((s) => s.h5PerFileStates[fileKey]?.colorByDepth ?? false)

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
        maxDimRef.current = maxDim
        cameraRef.current = camera
        controlsRef.current = controls
        const [initialFloor, initialCeil] = visibleIntensityWindow(
            vIntensities,
            initialRc.h5Threshold,
        )

        const axes = new THREE.AxesHelper(maxDim * AXES_HELPER_SCALE)
        scene.add(axes)

        const axisLen = maxDim * AXIS_LABEL_LENGTH_SCALE
        const labelScale = maxDim * AXIS_LABEL_SIZE_SCALE
        const axisLabels = createAxisLabels(scene, axisLen, labelScale)
        const voxelSizeUm =
            useViewerStore.getState().h5PerFileStates[fileKey]?.sliceVoxelSizeUm ??
            DEFAULT_VOXEL_SIZE_UM
        const tickLabels = createAxisTickLabels(
            scene,
            meta,
            voxelSizeUm,
            labelScale,
            initialRc.volumeSpacing,
        )

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
                uColormap: { value: 0 },
                uColormapMin: { value: 0 },
                uColormapMax: { value: 1 },
                uColorByDepth: { value: 0 },
                uIntensityFloor: { value: initialFloor },
                uIntensityCeil: { value: initialCeil },
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
            camera.position.set(
                maxDim * CAMERA_START_OFFSET[0],
                maxDim * CAMERA_START_OFFSET[1],
                maxDim * CAMERA_START_OFFSET[2],
            )
            camera.lookAt(0, 0, 0)
        }
        camera.near = maxDim * CAMERA_NEAR_FACTOR
        camera.far = maxDim * CAMERA_FAR_FACTOR
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
            ;[...axisLabels, ...tickLabels].forEach((sprite) => {
                sprite.material.map?.dispose()
                sprite.material.dispose()
            })
            materialRef.current = null
            chunkGeosRef.current = []
            boxHelperRef.current = null
            sceneRef.current = null
            cameraRef.current = null
            controlsRef.current = null
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
        let reader: FileReader | null = null

        if (stlOverlayFile) {
            const loader = new STLLoader()
            reader = new FileReader()
            reader.onload = (e) => {
                if (!(e.target?.result instanceof ArrayBuffer)) return
                const geo = loader.parse(e.target.result)
                geo.computeVertexNormals()
                geo.computeBoundingBox()
                const center = new THREE.Vector3()
                const bb = geo.boundingBox
                if (!bb) return
                bb.getCenter(center)
                geo.translate(-center.x, -center.y, -center.z)

                const mat = new THREE.MeshStandardMaterial({
                    color: STL_OVERLAY_COLOR,
                    transparent: true,
                    opacity: STL_OVERLAY_OPACITY,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                })
                stlMeshGroup.add(new THREE.Mesh(geo, mat))
                scene.add(stlMeshGroup)

                const ambient = new THREE.AmbientLight(
                    STL_OVERLAY_LIGHT_COLOR,
                    STL_OVERLAY_AMBIENT_INTENSITY,
                )
                const dir = new THREE.DirectionalLight(
                    STL_OVERLAY_LIGHT_COLOR,
                    STL_OVERLAY_DIR_INTENSITY,
                )
                dir.position.set(...STL_OVERLAY_DIR_POSITION)
                lights.push(ambient, dir)
                lights.forEach((l) => scene.add(l))
                needsRenderRef.current = true
            }
            reader.readAsArrayBuffer(stlOverlayFile)
        }

        return () => {
            // Abort an in-flight read so a stale onload can't add a mesh to a scene
            // whose group was already removed (rapid overlay switching).
            reader?.abort()
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
            needsRenderRef.current = true
        }
    }, [stlOverlayFile])

    const cameraResetGen = useViewerStore((s) => s.h5PerFileStates[fileKey]?.cameraResetGen ?? 0)
    const lastCameraResetGenRef = useRef(cameraResetGen)
    useEffect(() => {
        if (cameraResetGen === lastCameraResetGenRef.current) return
        lastCameraResetGenRef.current = cameraResetGen
        const camera = cameraRef.current
        const controls = controlsRef.current
        const maxDim = maxDimRef.current
        if (!camera || !controls || !maxDim) return
        camera.position.set(
            maxDim * CAMERA_START_OFFSET[0],
            maxDim * CAMERA_START_OFFSET[1],
            maxDim * CAMERA_START_OFFSET[2],
        )
        controls.target.set(0, 0, 0)
        controls.update()
        needsRenderRef.current = true
    }, [cameraResetGen])

    const zoomToCursor = useViewerStore((s) => s.zoomToCursor)
    const toggleZoomToCursor = useViewerStore((s) => s.toggleZoomToCursor)
    useEffect(() => {
        if (controlsRef.current) controlsRef.current.zoomToCursor = zoomToCursor
    }, [zoomToCursor])

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
        // The visible intensity window shifts with the threshold — refit so the
        // colormap keeps spanning exactly the currently displayed voxels.
        const [floor, ceil] = visibleIntensityWindow(vIntensities, h5Threshold)
        mat.uniforms.uIntensityFloor.value = floor
        mat.uniforms.uIntensityCeil.value = ceil
        needsRenderRef.current = true
    }, [h5Threshold, vIntensities])

    // volumeSpacing + clip ranges both affect the bounding box. Keep isolated from pure
    // uniform updates so only these expensive box mutations trigger this effect.
    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uVolumeSpacing.value = volumeSpacing
        const boxHelper = boxHelperRef.current
        if (boxHelper) {
            const { nSlices, height, width } = meta
            // Mirror the vertex-shader coordinate transform:
            //   x = w  - width/2          (uWidthRange  → pixel coords)
            //   y = (s - nSlices/2) * (volumeSpacing / nSlices)
            //   z = h  - height/2         (uHeightRange → pixel coords)
            boxHelper.box.min.set(
                widthMin - width / 2,
                (sliceMin - nSlices / 2) * (volumeSpacing / nSlices),
                heightMin - height / 2,
            )
            boxHelper.box.max.set(
                widthMax - width / 2,
                (sliceMax - nSlices / 2) * (volumeSpacing / nSlices),
                heightMax - height / 2,
            )
        }
        needsRenderRef.current = true
    }, [volumeSpacing, sliceMin, sliceMax, widthMin, widthMax, heightMin, heightMax, meta])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uColormap.value = sliceColormap === 'jet' ? 1 : sliceColormap === 'hot' ? 2 : 0
        needsRenderRef.current = true
    }, [sliceColormap])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uColormapMin.value = colormapRange[0]
        mat.uniforms.uColormapMax.value = colormapRange[1]
        needsRenderRef.current = true
    }, [colormapRange])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
        mat.uniforms.uColorByDepth.value = colorByDepth ? 1 : 0
        needsRenderRef.current = true
    }, [colorByDepth])

    useEffect(() => {
        const mat = materialRef.current
        if (!mat) return
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

    return (
        <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
            <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
            <ZoomModeButton active={zoomToCursor} onToggle={toggleZoomToCursor} />
        </Box>
    )
}
