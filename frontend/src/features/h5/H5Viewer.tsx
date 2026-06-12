import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { Box, IconButton, Tooltip } from '@mui/material'
import GridOnIcon from '@mui/icons-material/GridOn'
import GridOffIcon from '@mui/icons-material/GridOff'
import {
    useViewerStore,
    defaultRenderControls,
    fullVolumeCropBox,
} from '../../app/store/viewerSlice'
import { createScene, disposeSceneGeometry } from '../../shared/three/sceneUtils'
import { palette } from '../../shared/theme/palette'
import { ZoomModeButton } from '../../shared/components'
import type { H5Meta, H5TabEntry } from '../../shared/types/viewer.types'
import { createAxisLabels, createAxisTickLabels } from './createAxisLabels'
import { DEFAULT_VOXEL_SIZE_UM, DEFAULT_COLORMAP_RANGE } from '../../shared/constants'
import {
    vertexShader,
    fragmentShader,
    objectOverlayVertexShader,
    objectOverlayFragmentShader,
} from './h5ViewerShaders'
import { applyDrawRanges, countAboveThreshold } from './h5DrawUtils'
import { objectColorRgb } from '../controls/cropObjectAnalysis'
import { annotationArrays } from '../annotation/annotationMask'
import { ANNOTATION_PALETTE } from '../annotation/annotationPalette'

// Firefox caps drawArraysInstanced at 30 M vertices per draw call; leave headroom
const MAX_VERTS_PER_DRAW = 28_000_000

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

// Crop-selection box colour (orange), distinct from the green volume bounds.
const CROP_BOX_COLOR = 0xff9800
// Opacity of the crop box's translucent faces (edges stay fully opaque).
const CROP_BOX_FACE_OPACITY = 0.12
// Object-overlay points render on top of the underlying cloud (depth-test off) and
// adopt the cloud's own point size, so each labelled voxel is coloured exactly in
// place rather than appearing as a larger separate marker.
const OBJECT_OVERLAY_RENDER_ORDER = 999

// STL overlay appearance: a semi-transparent blue mesh lit by its own ambient + key light.
const STL_OVERLAY_COLOR = 0x88aaff
const STL_OVERLAY_OPACITY = 0.4
const STL_OVERLAY_LIGHT_COLOR = 0xffffff
const STL_OVERLAY_AMBIENT_INTENSITY = 0.6
const STL_OVERLAY_DIR_INTENSITY = 1.2
const STL_OVERLAY_DIR_POSITION: [number, number, number] = [1, 2, 3]

// Scene framing, expressed as multiples of the volume's largest dimension (maxDim).
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
    // The orange crop-selection box (transparent faces + solid edges as one unit
    // cube scaled to the selection); shown only while crop mode is active.
    const cropBoxGroupRef = useRef<THREE.Group | null>(null)
    // Coloured point overlay marking the voxels of each counted object.
    const objectOverlayRef = useRef<THREE.Points | null>(null)
    const objectOverlayMatRef = useRef<THREE.ShaderMaterial | null>(null)
    // Coloured point overlay mirroring the per-tab annotation mask (read-only in 3D).
    const annotationOverlayRef = useRef<THREE.Points | null>(null)
    // Crop shape meshes: a box, an inscribed cylinder, and an inscribed sphere;
    // one is shown per cropShape and is the target of the move gizmo.
    const cropCylinderGroupRef = useRef<THREE.Group | null>(null)
    const cropSphereGroupRef = useRef<THREE.Group | null>(null)
    // Translate gizmo (TransformControls) for moving the crop shape in 3D space.
    const transformControlsRef = useRef<TransformControls | null>(null)
    const axesGroupRef = useRef<THREE.Group | null>(null)
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
    const axesVisible = useViewerStore((s) => s.axesVisible)
    const toggleAxesVisible = useViewerStore((s) => s.toggleAxesVisible)
    const cropMode = useViewerStore((s) => s.h5PerFileStates[fileKey]?.cropMode ?? false)
    const cropBox = useViewerStore((s) => s.h5PerFileStates[fileKey]?.cropBox)
    const objectLabeling = useViewerStore((s) => s.h5PerFileStates[fileKey]?.objectLabeling ?? null)
    const objectColorsVisible = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.objectColorsVisible ?? false,
    )
    const annotationVersion = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.annotationVersion ?? 0,
    )
    const cropShape = useViewerStore((s) => s.h5PerFileStates[fileKey]?.cropShape ?? 'rect')

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

        // Colormap state is per-file and must survive geometry rebuilds (e.g. after
        // a filter replaces the volume data). Read it imperatively here so a rebuilt
        // material starts with the user's chosen colormap instead of the gray default;
        // the dedicated colormap effects below keep it in sync on later changes.
        const initialPerFile = useViewerStore.getState().h5PerFileStates[fileKey]
        const initialColormap = initialPerFile?.sliceColormap ?? 'gray'
        const [initialColormapMin, initialColormapMax] =
            initialPerFile?.sliceColormapRange ?? DEFAULT_COLORMAP_RANGE
        const initialColorByDepth = initialPerFile?.colorByDepth ?? false
        const colormapToInt = (c: typeof initialColormap) => (c === 'jet' ? 1 : c === 'hot' ? 2 : 0)

        // Group all axis decorations so visibility can be toggled with one flag.
        // The group sits at the box's min corner so the origin coincides with a
        // corner of the green bounding box (instead of its centre); each axis then
        // runs along the box edge into the +X / +Y / +Z directions.
        const axisLengths: [number, number, number] = [width, initialRc.volumeSpacing, height]
        const axesGroup = new THREE.Group()
        axesGroup.position.set(-width / 2, -initialRc.volumeSpacing / 2, -height / 2)
        axesGroup.visible = useViewerStore.getState().axesVisible
        scene.add(axesGroup)
        axesGroupRef.current = axesGroup

        // AxesHelper draws unit-length lines from its origin along +X/+Y/+Z; scaling
        // it per-axis makes each line span the full corresponding box edge.
        const axes = new THREE.AxesHelper(1)
        axes.scale.set(axisLengths[0], axisLengths[1], axisLengths[2])
        axesGroup.add(axes)

        const labelScale = maxDim * AXIS_LABEL_SIZE_SCALE
        const axisLabels = createAxisLabels(axesGroup, axisLengths, labelScale)
        const voxelSizeUm =
            useViewerStore.getState().h5PerFileStates[fileKey]?.sliceVoxelSizeUm ??
            DEFAULT_VOXEL_SIZE_UM
        const tickLabels = createAxisTickLabels(
            axesGroup,
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
                uColormap: { value: colormapToInt(initialColormap) },
                uColormapMin: { value: initialColormapMin },
                uColormapMax: { value: initialColormapMax },
                uColorByDepth: { value: initialColorByDepth ? 1 : 0 },
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

        // Orange crop-selection box: a unit cube (transparent faces + solid edges)
        // positioned/scaled by the dedicated effect below. Built once at unit size
        // and centred at the origin so the effect only sets position + scale.
        const cropColor = new THREE.Color(CROP_BOX_COLOR)
        const cropGroup = new THREE.Group()
        const cropUnitGeo = new THREE.BoxGeometry(1, 1, 1)
        const cropFaces = new THREE.Mesh(
            cropUnitGeo,
            new THREE.MeshBasicMaterial({
                color: cropColor,
                transparent: true,
                opacity: CROP_BOX_FACE_OPACITY,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        )
        const cropEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(cropUnitGeo),
            new THREE.LineBasicMaterial({ color: cropColor }),
        )
        cropGroup.add(cropFaces, cropEdges)
        cropGroup.visible = false
        scene.add(cropGroup)
        cropBoxGroupRef.current = cropGroup

        // Companion cylinder for circular crops (unit radius 1, height 1, axis = Y =
        // the slice/volume-spacing direction). Shown instead of the box when the crop
        // shape is 'circle'; the effect below sets its position + scale.
        const cropCylGroup = new THREE.Group()
        const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true)
        const cylFaces = new THREE.Mesh(
            cylGeo,
            new THREE.MeshBasicMaterial({
                color: cropColor,
                transparent: true,
                opacity: CROP_BOX_FACE_OPACITY,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        )
        const cylEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(cylGeo),
            new THREE.LineBasicMaterial({ color: cropColor }),
        )
        cropCylGroup.add(cylFaces, cylEdges)
        cropCylGroup.visible = false
        scene.add(cropCylGroup)
        cropCylinderGroupRef.current = cropCylGroup

        // Companion sphere/ellipsoid for spherical crops.
        const cropSphGroup = new THREE.Group()
        const sphGeo = new THREE.SphereGeometry(1, 32, 24)
        const sphFaces = new THREE.Mesh(
            sphGeo,
            new THREE.MeshBasicMaterial({
                color: cropColor,
                transparent: true,
                opacity: CROP_BOX_FACE_OPACITY,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        )
        // A sphere has no hard edges, so use a coarse wireframe for a visible outline.
        const sphWire = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 12, 8)),
            new THREE.LineBasicMaterial({ color: cropColor, transparent: true, opacity: 0.5 }),
        )
        cropSphGroup.add(sphFaces, sphWire)
        cropSphGroup.visible = false
        scene.add(cropSphGroup)
        cropSphereGroupRef.current = cropSphGroup

        // Move gizmo — translates whichever crop shape is active; updates the store.
        const transformControls = new TransformControls(camera, renderer.domElement)
        transformControls.setMode('translate')
        transformControls.setSize(0.8)
        transformControls.addEventListener('dragging-changed', (e) => {
            controls.enabled = !e.value
        })
        transformControls.addEventListener('change', () => {
            needsRenderRef.current = true
        })
        transformControls.addEventListener('objectChange', () => {
            const obj = transformControls.object
            if (!obj) return
            const { nSlices, height, width } = meta
            const st = useViewerStore.getState()
            const pf = st.h5PerFileStates[fileKey]
            const box = pf?.cropBox ?? fullVolumeCropBox(meta)
            const spacing = pf?.renderControls?.volumeSpacing ?? defaultRenderControls.volumeSpacing
            // Invert the box-centre transform to recover the origin from the position.
            const nx = obj.position.x + width / 2 - box.w / 2
            const nz = obj.position.y / (spacing / nSlices) + nSlices / 2 - box.d / 2
            const ny = obj.position.z + height / 2 - box.h / 2
            st.setCropBox(fileKey, {
                ...box,
                x: Math.round(Math.max(0, Math.min(width - box.w, nx))),
                y: Math.round(Math.max(0, Math.min(height - box.h, ny))),
                z: Math.round(Math.max(0, Math.min(nSlices - box.d, nz))),
            })
        })
        scene.add(transformControls.getHelper())
        transformControlsRef.current = transformControls

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
            const tc = transformControlsRef.current
            if (tc) {
                tc.detach()
                scene.remove(tc.getHelper())
                tc.dispose()
            }
            boxHelperRef.current = null
            cropBoxGroupRef.current = null
            cropCylinderGroupRef.current = null
            cropSphereGroupRef.current = null
            transformControlsRef.current = null
            objectOverlayRef.current = null
            objectOverlayMatRef.current = null
            annotationOverlayRef.current = null
            axesGroupRef.current = null
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
        // Keep the object overlay clipped to the same threshold as the cloud.
        const om = objectOverlayMatRef.current
        if (om) om.uniforms.uThreshold.value = h5Threshold
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

    // Crop-selection box: mirrors the clip-box coordinate transform. Shown only in
    // crop mode; box extents follow the per-file cropBox (defaults to full volume).
    useEffect(() => {
        const cropGroup = cropBoxGroupRef.current
        const cylGroup = cropCylinderGroupRef.current
        const sphGroup = cropSphereGroupRef.current
        if (!cropGroup || !cylGroup || !sphGroup) return
        cropGroup.visible = cropMode && cropShape === 'rect'
        cylGroup.visible = cropMode && cropShape === 'circle'
        sphGroup.visible = cropMode && cropShape === 'sphere'
        if (cropMode) {
            const { nSlices, height, width } = meta
            const box = cropBox ?? fullVolumeCropBox(meta)
            // Same coordinate transform as the clip box; convert min/max into a centre
            // (position) and extent (scale) per shape's geometry convention.
            const minX = box.x - width / 2
            const maxX = box.x + box.w - width / 2
            const minY = (box.z - nSlices / 2) * (volumeSpacing / nSlices)
            const maxY = (box.z + box.d - nSlices / 2) * (volumeSpacing / nSlices)
            const minZ = box.y - height / 2
            const maxZ = box.y + box.h - height / 2
            const cx = (minX + maxX) / 2
            const cy = (minY + maxY) / 2
            const cz = (minZ + maxZ) / 2
            const sx = Math.max(maxX - minX, 0.001)
            const sy = Math.max(maxY - minY, 0.001)
            const sz = Math.max(maxZ - minZ, 0.001)
            if (cropShape === 'circle') {
                // Elliptical cylinder filling the box footprint; axis (height) along Y.
                cylGroup.position.set(cx, cy, cz)
                cylGroup.scale.set(sx / 2, sy, sz / 2)
            } else if (cropShape === 'sphere') {
                // Ellipsoid filling the box (unit sphere radius 1 → half-extent scale).
                sphGroup.position.set(cx, cy, cz)
                sphGroup.scale.set(sx / 2, sy / 2, sz / 2)
            } else {
                // Box (unit cube size 1 → full-extent scale).
                cropGroup.position.set(cx, cy, cz)
                cropGroup.scale.set(sx, sy, sz)
            }
        }
        needsRenderRef.current = true
    }, [cropMode, cropShape, cropBox, volumeSpacing, meta])

    // Attach the translate gizmo to the active crop shape while in crop mode.
    useEffect(() => {
        const tc = transformControlsRef.current
        if (!tc) return
        const target = !cropMode
            ? null
            : cropShape === 'sphere'
              ? cropSphereGroupRef.current
              : cropShape === 'circle'
                ? cropCylinderGroupRef.current
                : cropBoxGroupRef.current
        if (target) tc.attach(target)
        else tc.detach()
        tc.enabled = !!target
        needsRenderRef.current = true
    }, [cropMode, cropShape])

    // Coloured object overlay: one point per labelled voxel, tinted by object rank.
    // Built when the labelling or its visibility changes; the Y scale tracks volume
    // spacing via the dedicated effect below (so spacing changes don't rebuild it).
    useEffect(() => {
        const scene = sceneRef.current
        if (!scene) return

        const disposeOverlay = () => {
            const prev = objectOverlayRef.current
            if (!prev) return
            scene.remove(prev)
            prev.geometry.dispose()
            ;(prev.material as THREE.Material).dispose()
            objectOverlayRef.current = null
            objectOverlayMatRef.current = null
        }
        disposeOverlay()

        if (!objectColorsVisible || !objectLabeling) {
            needsRenderRef.current = true
            return
        }

        const { nSlices, height, width } = meta
        const { box, labels, count } = objectLabeling
        const wh = box.w * box.h
        const sliceStride = height * width
        // Per-voxel intensity so the overlay shader can apply the same threshold the
        // cloud uses; falls back to fully-opaque (always pass) if buffers were evicted.
        const normalizedVolume = useViewerStore
            .getState()
            .tabs.find((t): t is H5TabEntry => t.type === 'h5' && t.name === fileKey)?.data
            ?.normalizedVolume

        // Per-rank colour table so each voxel only does a lookup.
        const colorByRank = new Float32Array((count + 1) * 3)
        for (let rank = 1; rank <= count; rank++) {
            const [r, g, b] = objectColorRgb(rank)
            colorByRank[rank * 3] = r
            colorByRank[rank * 3 + 1] = g
            colorByRank[rank * 3 + 2] = b
        }

        let labelled = 0
        for (let i = 0; i < labels.length; i++) if (labels[i] > 0) labelled++

        const positions = new Float32Array(labelled * 3)
        const colors = new Float32Array(labelled * 3)
        const intensities = new Float32Array(labelled)
        let p = 0
        let k = 0
        for (let i = 0; i < labels.length; i++) {
            const rank = labels[i]
            if (rank === 0) continue
            const lx = i % box.w
            const ly = ((i / box.w) | 0) % box.h
            const lz = (i / wh) | 0
            const s = box.z + lz
            const vh = box.y + ly
            const vw = box.x + lx
            // X/Z in pixel coords; Y stored as the slice offset (scaled by the
            // spacing effect into world units, matching the vertex-shader transform).
            positions[p] = vw - width / 2
            positions[p + 1] = s - nSlices / 2
            positions[p + 2] = vh - height / 2
            const ci = rank * 3
            colors[p] = colorByRank[ci]
            colors[p + 1] = colorByRank[ci + 1]
            colors[p + 2] = colorByRank[ci + 2]
            intensities[k] = normalizedVolume
                ? normalizedVolume[s * sliceStride + vh * width + vw] / 255
                : 1
            p += 3
            k++
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
        geo.setAttribute('aIntensity', new THREE.BufferAttribute(intensities, 1))
        const initialRc =
            useViewerStore.getState().h5PerFileStates[fileKey]?.renderControls ?? defaultRenderControls
        const mat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                uNSlices: { value: nSlices },
                uHeight: { value: height },
                uWidth: { value: width },
                // Match the cloud's own point size so each voxel is coloured in place.
                uPointSize: { value: initialRc.h5PointSize },
                // Same visibility tests as the main cloud → only visible voxels tinted.
                uThreshold: { value: initialRc.h5Threshold },
                uSliceMin: { value: initialRc.h5SliceRange[0] },
                uSliceMax: { value: initialRc.h5SliceRange[1] },
                uWidthMin: { value: initialRc.h5WidthRange[0] },
                uWidthMax: { value: initialRc.h5WidthRange[1] },
                uHeightMin: { value: initialRc.h5HeightRange[0] },
                uHeightMax: { value: initialRc.h5HeightRange[1] },
            },
            vertexShader: objectOverlayVertexShader,
            fragmentShader: objectOverlayFragmentShader,
            depthTest: false,
        })
        const points = new THREE.Points(geo, mat)
        points.frustumCulled = false
        points.renderOrder = OBJECT_OVERLAY_RENDER_ORDER
        points.scale.y = initialRc.volumeSpacing / nSlices
        scene.add(points)
        objectOverlayRef.current = points
        objectOverlayMatRef.current = mat
        needsRenderRef.current = true

        return disposeOverlay
    }, [objectLabeling, objectColorsVisible, meta, fileKey])

    // Keep the overlay's Y scale in sync with volume spacing without a full rebuild.
    useEffect(() => {
        const overlay = objectOverlayRef.current
        if (!overlay) return
        overlay.scale.y = volumeSpacing / meta.nSlices
        needsRenderRef.current = true
    }, [volumeSpacing, meta])

    // Keep the overlay's point size and clip ranges matched to the cloud's, so the
    // coloured voxels stay the same size and only show where the cloud shows them.
    useEffect(() => {
        const om = objectOverlayMatRef.current
        if (!om) return
        om.uniforms.uPointSize.value = h5PointSize
        om.uniforms.uSliceMin.value = sliceMin
        om.uniforms.uSliceMax.value = sliceMax
        om.uniforms.uWidthMin.value = widthMin
        om.uniforms.uWidthMax.value = widthMax
        om.uniforms.uHeightMin.value = heightMin
        om.uniforms.uHeightMax.value = heightMax
        needsRenderRef.current = true
    }, [h5PointSize, sliceMin, sliceMax, widthMin, widthMax, heightMin, heightMax])

    // Annotation voxel overlay — mirrors the per-tab mask painted in the 2D view.
    // Rebuilt whenever the mask changes (annotationVersion); read-only in 3D.
    useEffect(() => {
        const scene = sceneRef.current
        if (!scene) return

        const disposeAnno = () => {
            const prev = annotationOverlayRef.current
            if (!prev) return
            scene.remove(prev)
            prev.geometry.dispose()
            ;(prev.material as THREE.Material).dispose()
            annotationOverlayRef.current = null
        }
        disposeAnno()

        const mask = useViewerStore.getState().h5PerFileStates[fileKey]?.annotationMask
        if (!mask) {
            needsRenderRef.current = true
            return
        }
        const { indices, labels } = annotationArrays(fileKey, mask)
        if (indices.length === 0) {
            needsRenderRef.current = true
            return
        }

        const { nSlices, height, width } = meta
        const sliceStride = height * width
        // Per-label RGB (0–1) for vertex colours.
        const maxLabel = Math.max(...ANNOTATION_PALETTE.map((c) => c.label))
        const colorByLabel = new Float32Array((maxLabel + 1) * 3)
        for (const c of ANNOTATION_PALETTE) {
            colorByLabel[c.label * 3] = c.rgb[0] / 255
            colorByLabel[c.label * 3 + 1] = c.rgb[1] / 255
            colorByLabel[c.label * 3 + 2] = c.rgb[2] / 255
        }

        const positions = new Float32Array(indices.length * 3)
        const colors = new Float32Array(indices.length * 3)
        for (let i = 0; i < indices.length; i++) {
            const gi = indices[i]
            const s = (gi / sliceStride) | 0
            const rem = gi % sliceStride
            const vh = (rem / width) | 0
            const vw = rem % width
            const p = i * 3
            positions[p] = vw - width / 2
            positions[p + 1] = s - nSlices / 2 // slice offset; scaled by spacing below
            positions[p + 2] = vh - height / 2
            const ci = labels[i] * 3
            colors[p] = colorByLabel[ci]
            colors[p + 1] = colorByLabel[ci + 1]
            colors[p + 2] = colorByLabel[ci + 2]
        }

        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        const initialRc =
            useViewerStore.getState().h5PerFileStates[fileKey]?.renderControls ??
            defaultRenderControls
        const mat = new THREE.PointsMaterial({
            size: Math.max(initialRc.h5PointSize, 2),
            sizeAttenuation: false,
            vertexColors: true,
            depthTest: false,
        })
        const points = new THREE.Points(geo, mat)
        points.frustumCulled = false
        points.renderOrder = OBJECT_OVERLAY_RENDER_ORDER + 1
        points.scale.y = initialRc.volumeSpacing / nSlices
        scene.add(points)
        annotationOverlayRef.current = points
        needsRenderRef.current = true

        return disposeAnno
    }, [annotationVersion, meta, fileKey])

    // Keep the annotation overlay's Y scale / point size synced (no rebuild).
    useEffect(() => {
        const overlay = annotationOverlayRef.current
        if (!overlay) return
        overlay.scale.y = volumeSpacing / meta.nSlices
        ;(overlay.material as THREE.PointsMaterial).size = Math.max(h5PointSize, 2)
        needsRenderRef.current = true
    }, [volumeSpacing, h5PointSize, meta])

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
        const group = axesGroupRef.current
        if (!group) return
        group.visible = axesVisible
        needsRenderRef.current = true
    }, [axesVisible])

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
            <Tooltip
                title={axesVisible ? 'Achsen ausblenden' : 'Achsen einblenden'}
                placement="left"
            >
                <IconButton
                    size="small"
                    onClick={toggleAxesVisible}
                    sx={{
                        position: 'absolute',
                        bottom: 40,
                        right: 8,
                        p: 0.6,
                        color: axesVisible ? palette.accentBlue : palette.sceneTextMuted,
                        background: palette.overlayScrim,
                        borderRadius: 0.5,
                        '&:hover': { background: palette.accentBlueHoverBg },
                    }}
                >
                    {axesVisible ? (
                        <GridOnIcon sx={{ fontSize: 20 }} />
                    ) : (
                        <GridOffIcon sx={{ fontSize: 20 }} />
                    )}
                </IconButton>
            </Tooltip>
        </Box>
    )
}
