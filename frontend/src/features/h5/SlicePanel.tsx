import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material'
import StraightenIcon from '@mui/icons-material/Straighten'
import CloseIcon from '@mui/icons-material/Close'
import { useViewerStore, DEFAULT_SLICE_PANEL_CONTROL } from '../../app/store/viewerSlice'
import type {
    AnnotationTool,
    ColormapType,
    H5Meta,
    ObjectLabeling,
} from '../../shared/types/viewer.types'
import { DEFAULT_COLORMAP } from '../../shared/types/viewer.types'
import { objectColorRgb } from '../controls/cropObjectAnalysis'
import { ANNOTATION_PALETTE, ANNOTATION_TINT_ALPHA } from '../annotation/annotationPalette'
import type { StrokePoint } from '../annotation/annotationMask'
import { palette } from '../../shared/theme/palette'

// Label → RGB lookup for the annotation overlay (fixed palette, built once).
const ANNO_LUT = (() => {
    const max = Math.max(...ANNOTATION_PALETTE.map((c) => c.label))
    const t = new Uint8Array((max + 1) * 3)
    for (const c of ANNOTATION_PALETTE) {
        t[c.label * 3] = c.rgb[0]
        t[c.label * 3 + 1] = c.rgb[1]
        t[c.label * 3 + 2] = c.rgb[2]
    }
    return t
})()
const ANNO_LUT_MAX = ANNO_LUT.length / 3 - 1
import {
    UM_PER_MM,
    DEFAULT_VOXEL_SIZE_UM,
    DEFAULT_COLORMAP_RANGE,
    UINT8_MAX,
} from '../../shared/constants'
import { slicePanelSliderSx, sliceRowLabelSx, sliceRowValueSx } from './H5SliceViewer.styles'
import { RENDER_CONTROL_LIMITS } from '../controls/renderControlLimits'

export interface SlicePanelProps {
    normalizedVolume: Uint8Array
    meta: H5Meta
    axis: 'z' | 'y' | 'x'
    sliceIndex: number
    fileKey: string
    label: string
    orient?: 'ccw90' | 'flipH' | 'flip180'
    onSliceChange: (v: number) => void
    colormap?: ColormapType
    colormapRange?: [number, number]
    voxelSizeUm?: [number, number, number]
    /** When true, click+drag draws a crop rectangle instead of panning. */
    cropMode?: boolean
    /** Persisted crop selection in this panel's pre-orientation (orig) coords. */
    cropRectOrig?: { ox0: number; oy0: number; ox1: number; oy1: number } | null
    /** Emitted on crop-drag end with the two corners in orig coords. */
    onCropRect?: (a: { ox: number; oy: number }, b: { ox: number; oy: number }) => void
    /** Object-count labelling whose voxels are tinted with per-object colours. */
    objectLabeling?: ObjectLabeling | null
    /** When true, overlay the object colours from `objectLabeling`. */
    showObjectColors?: boolean
    /** Visibility threshold (0–1): only voxels at/above it are tinted, matching the cloud. */
    objectThreshold?: number
    /** Active toolbar tool — governs mouse behaviour (paint / crop / pan). */
    activeTool?: AnnotationTool
    /** Brush/eraser radius in voxels. */
    brushRadius?: number
    /** Colour label the brush paints with. */
    activeColorLabel?: number
    /** Annotation mask for this tab (label per voxel) — drawn as a semi-transparent overlay. */
    annotationMask?: Uint8Array | null
    /** Bumped on mask edits; included in the draw deps so the overlay refreshes. */
    annotationVersion?: number
    /** Paint a stroke of in-plane points with the given label (0 erases). */
    onPaint?: (points: StrokePoint[], label: number) => void
    /** Confirm a circular selection (two corners of its bounding square, orig coords). */
    onCircleCrop?: (a: { ox: number; oy: number }, b: { ox: number; oy: number }) => void
    /** Persisted crop shape — non-'rect' draws an ellipse overlay instead of a rectangle. */
    cropShape?: 'rect' | 'circle' | 'sphere'
}

/** Alpha for the object-colour tint blended over the grayscale/colormap pixel. */
const OBJECT_TINT_ALPHA = 0.55

const LUT_SIZE = 256
const TONE_MAP_PIVOT = 0.5
const MEASURE_RADIUS = 5
const SCALE_BAR_COLOR = palette.scaleBar
const COLORBAR_STOPS = 12

function applyToneMap(value: number, brightness: number, contrast: number): number {
    let c = Math.min(value * brightness, 1.0)
    if (c < TONE_MAP_PIVOT) c = TONE_MAP_PIVOT * Math.pow(c / TONE_MAP_PIVOT, contrast)
    else c = 1.0 - TONE_MAP_PIVOT * Math.pow((1.0 - c) / TONE_MAP_PIVOT, contrast)
    return Math.round(c * UINT8_MAX)
}

function colormapRGB(t: number, colormap: ColormapType): [number, number, number] {
    switch (colormap) {
        case 'jet': {
            const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)))
            const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)))
            const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)))
            return [r, g, b]
        }
        case 'hot':
            return [
                Math.max(0, Math.min(1, t * 3)),
                Math.max(0, Math.min(1, t * 3 - 1)),
                Math.max(0, Math.min(1, t * 3 - 2)),
            ]
        default:
            return [t, t, t]
    }
}

// Convert screen click (relative to container) → canvas pixel coords.
//
// The canvas element is CSS-constrained by maxWidth/maxHeight so its displayed
// CSS size (cssDW × cssDH) can be smaller than its pixel dimensions
// (canvasW × canvasH). Without correcting for this ratio the measured coords
// are offset (especially noticeable on the YZ panel where canvasH = 512).
function screenToCanvas(
    sx: number,
    sy: number,
    containerW: number,
    containerH: number,
    canvasW: number,
    canvasH: number,
    cssDW: number,
    cssDH: number,
    zoom: number,
    panX: number,
    panY: number,
): { cx: number; cy: number } {
    const mx = sx - containerW / 2
    const my = sy - containerH / 2
    return {
        cx: ((mx - panX) / zoom) * (canvasW / cssDW) + canvasW / 2,
        cy: ((my - panY) / zoom) * (canvasH / cssDH) + canvasH / 2,
    }
}

// Inverse of canvasToOrig: map original (pre-orientation) coords back to canvas pixels.
function origToCanvas(
    ox: number,
    oy: number,
    orient: string | undefined,
    origW: number,
    origH: number,
): { cx: number; cy: number } {
    if (orient === 'ccw90') return { cx: oy, cy: origW - 1 - ox }
    if (orient === 'flipH') return { cx: origW - 1 - ox, cy: oy }
    if (orient === 'flip180') return { cx: origW - 1 - ox, cy: origH - 1 - oy }
    return { cx: ox, cy: oy }
}

// Crop-rectangle overlay colours (orange, matching the 3D crop box).
const CROP_STROKE = palette.cropAccent
const CROP_FILL = palette.cropAccentSoft

// Map canvas pixel (cx, cy) to original (pre-orientation-transform) volume coords.
function canvasToOrig(
    cx: number,
    cy: number,
    orient: string | undefined,
    origW: number,
    origH: number,
): { ox: number; oy: number } {
    if (orient === 'ccw90') return { ox: origW - 1 - cy, oy: cx }
    if (orient === 'flipH') return { ox: origW - 1 - cx, oy: cy }
    if (orient === 'flip180') return { ox: origW - 1 - cx, oy: origH - 1 - cy }
    return { ox: cx, oy: cy }
}

// Euclidean distance in mm between two canvas-coordinate points, accounting for
// per-axis voxel spacing [dz, dy, dx] (µm/vox).
function computeDistanceMm(
    p1: { cx: number; cy: number },
    p2: { cx: number; cy: number },
    axis: 'z' | 'y' | 'x',
    orient: string | undefined,
    origW: number,
    origH: number,
    voxelSizeUm: [number, number, number],
): number {
    const r1 = canvasToOrig(p1.cx, p1.cy, orient, origW, origH)
    const r2 = canvasToOrig(p2.cx, p2.cy, orient, origW, origH)
    const [dz, dy, dx] = voxelSizeUm
    let d1Um: number, d2Um: number
    if (axis === 'z') {
        // XY plane: ox → volume-x (width dim), oy → volume-y (height dim)
        d1Um = (r2.ox - r1.ox) * dx
        d2Um = (r2.oy - r1.oy) * dy
    } else if (axis === 'y') {
        // XZ plane: ox → volume-x, oy → volume-z (nSlices)
        d1Um = (r2.ox - r1.ox) * dx
        d2Um = (r2.oy - r1.oy) * dz
    } else {
        // YZ plane: ox → volume-z (nSlices), oy → volume-y (height)
        d1Um = (r2.ox - r1.ox) * dz
        d2Um = (r2.oy - r1.oy) * dy
    }
    return Math.sqrt(d1Um * d1Um + d2Um * d2Um) / UM_PER_MM
}

const ZOOM_STEP_FACTOR = 1.03
const MIN_ZOOM = 1
const MAX_ZOOM = 20

/** Pointer travel (CSS px) below which a measure press counts as a click, not a drag. */
const CLICK_DRAG_TOLERANCE_PX = 5
/** Minimum crop-drag travel (canvas px) before a selection is registered. */
const MIN_CROP_DRAG_PX = 2

// ── Scale bar helpers ─────────────────────────────────────────────────────────
const SCALE_NICE_UM = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000]
/** Target scale-bar length as a fraction of the canvas dimension. */
const SCALE_BAR_TARGET_FRACTION = 0.28
/** Rounds the target length down toward a "nice" value (half-step bias). */
const SCALE_BAR_ROUND_FACTOR = 0.5

function scaleBarUm(targetPx: number, umPerPx: number): number {
    const targetUm = targetPx * umPerPx
    return (
        SCALE_NICE_UM.find((v) => v >= targetUm * SCALE_BAR_ROUND_FACTOR) ??
        SCALE_NICE_UM[SCALE_NICE_UM.length - 1]
    )
}

function formatScaleUm(um: number): string {
    if (um >= UM_PER_MM)
        return `${Number.isInteger(um / UM_PER_MM) ? um / UM_PER_MM : (um / UM_PER_MM).toFixed(1)} mm`
    return `${um} µm`
}

function drawScaleBars(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    hUmPerPx: number,
    vUmPerPx: number,
    displayRatio: number,
): void {
    // All sizes target ~constant CSS-pixel size regardless of canvas resolution.
    const font = Math.max(8, Math.round(10 / displayRatio))
    const margin = Math.max(4, Math.round(5 / displayRatio))
    const tickLen = Math.max(3, Math.round(3 / displayRatio))
    const barH = Math.max(1, Math.round(1.5 / displayRatio))
    const gap = Math.max(2, Math.round(2 / displayRatio))

    ctx.save()
    ctx.font = `bold ${font}px sans-serif`

    // ── Horizontal bar (bottom-left) ──────────────────────────────────────────
    const hBarUm = scaleBarUm(canvasW * SCALE_BAR_TARGET_FRACTION, hUmPerPx)
    const hBarPx = hBarUm / hUmPerPx
    const hX = margin
    const hY = canvasH - margin

    ctx.fillStyle = palette.overlayScrim
    ctx.fillRect(
        hX - gap,
        hY - tickLen - font - gap * 2,
        hBarPx + gap * 2,
        tickLen + barH + font + gap * 3,
    )
    ctx.fillStyle = SCALE_BAR_COLOR
    ctx.fillRect(hX, hY - barH, hBarPx, barH)
    ctx.fillRect(hX, hY - barH - tickLen, barH, tickLen + barH)
    ctx.fillRect(hX + hBarPx - barH, hY - barH - tickLen, barH, tickLen + barH)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(formatScaleUm(hBarUm), hX + hBarPx / 2, hY - barH - tickLen - gap)

    // ── Vertical bar (top-left) ───────────────────────────────────────────────
    const vBarUm = scaleBarUm(canvasH * SCALE_BAR_TARGET_FRACTION, vUmPerPx)
    const vBarPx = vBarUm / vUmPerPx
    const vX = margin
    const vY = margin

    ctx.fillStyle = palette.overlayScrim
    ctx.fillRect(vX - gap, vY - gap, tickLen + barH + font + gap * 3, vBarPx + gap * 2)
    ctx.fillStyle = SCALE_BAR_COLOR
    ctx.fillRect(vX + tickLen, vY, barH, vBarPx)
    ctx.fillRect(vX, vY, tickLen + barH, barH)
    ctx.fillRect(vX, vY + vBarPx - barH, tickLen + barH, barH)
    ctx.save()
    ctx.translate(vX + tickLen + barH + gap, vY + vBarPx / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(formatScaleUm(vBarUm), 0, 0)
    ctx.restore()

    ctx.restore()
}

export const SlicePanel = memo(function SlicePanel({
    normalizedVolume,
    meta,
    axis,
    sliceIndex,
    fileKey,
    label,
    orient,
    onSliceChange,
    colormap = DEFAULT_COLORMAP,
    colormapRange = DEFAULT_COLORMAP_RANGE,
    voxelSizeUm = DEFAULT_VOXEL_SIZE_UM,
    cropMode = false,
    cropRectOrig = null,
    onCropRect,
    objectLabeling = null,
    showObjectColors = false,
    objectThreshold = 0,
    activeTool = null,
    brushRadius = 6,
    activeColorLabel = 1,
    annotationMask = null,
    annotationVersion = 0,
    onPaint,
    onCircleCrop,
    cropShape = 'rect',
}: SlicePanelProps) {
    const { nSlices, height, width } = meta
    const maxSlice = axis === 'z' ? nSlices - 1 : axis === 'y' ? height - 1 : width - 1
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    // Separate ref for the canvas area (excludes controls strip at bottom).
    // Zoom and measurement clicks must use this rect so the pivot is the canvas center,
    // not the outer panel center (which is offset downward by the controls strip height).
    const canvasWrapperRef = useRef<HTMLDivElement>(null)
    const zoomRef = useRef(MIN_ZOOM)
    const panRef = useRef({ x: 0, y: 0 })
    const [cursorStyle, setCursorStyle] = useState<'grab' | 'crosshair' | 'default'>('default')
    const isDragging = useRef(false)
    const lastPos = useRef({ x: 0, y: 0 })
    const clickStartRef = useRef<{ x: number; y: number } | null>(null)

    // Measurement state — local to each panel
    const [measuring, setMeasuring] = useState(false)
    const [measurePoints, setMeasurePoints] = useState<{ cx: number; cy: number }[]>([])

    // Clear measurement points when the slice changes (old points no longer valid).
    // Done during render rather than in an effect to avoid a double render on each scrub.
    const [measuredSlice, setMeasuredSlice] = useState(sliceIndex)
    if (measuredSlice !== sliceIndex) {
        setMeasuredSlice(sliceIndex)
        setMeasurePoints([])
    }

    // Live crop-drag rectangle/circle in canvas coords (null when not dragging).
    const [cropDrag, setCropDrag] = useState<{
        s: { cx: number; cy: number }
        c: { cx: number; cy: number }
    } | null>(null)
    // Active brush/eraser stroke — true between mousedown and mouseup while painting.
    const isPainting = useRef(false)
    // Last painted point (orig coords) so a drag interpolates instead of leaving gaps.
    const lastPaintOrig = useRef<{ ox: number; oy: number } | null>(null)

    // The per-panel measurement mode takes precedence over annotation/crop tools, so
    // toggling measurement always works regardless of the globally-active tool.
    const isPaintTool = !measuring && (activeTool === 'brush' || activeTool === 'eraser')
    const isRectTool = !measuring && activeTool === 'rectCrop'
    // Circle and sphere crops both drag out a 2D ellipse on the slice.
    const isCircleTool = !measuring && (activeTool === 'circleCrop' || activeTool === 'sphereCrop')
    const paintLabel = activeTool === 'eraser' ? 0 : activeColorLabel

    const { brightness, contrast } = useViewerStore(
        (s) =>
            s.h5PerFileStates[fileKey]?.slicePanelControls?.[axis] ?? DEFAULT_SLICE_PANEL_CONTROL,
    )
    const setSlicePanelControl = useViewerStore((s) => s.setSlicePanelControl)

    // origW/origH: dimensions of the volume face shown before orientation transform.
    const origW = axis === 'x' ? nSlices : width
    const origH = axis === 'y' ? nSlices : height
    const canvasW = orient === 'ccw90' ? origH : origW
    const canvasH = orient === 'ccw90' ? origW : origH

    // 3-channel RGB LUT (LUT_SIZE × 3 bytes).
    const lut = useMemo(() => {
        const table = new Uint8ClampedArray(LUT_SIZE * 3)
        const [rangeMin, rangeMax] = colormapRange
        const span = Math.max(rangeMax - rangeMin, 0.001)
        for (let i = 0; i < LUT_SIZE; i++) {
            const mapped = applyToneMap(i / UINT8_MAX, brightness, contrast) / UINT8_MAX
            const t = Math.max(0, Math.min(1, (mapped - rangeMin) / span))
            const [r, g, b] = colormapRGB(t, colormap)
            table[i * 3] = Math.round(r * UINT8_MAX)
            table[i * 3 + 1] = Math.round(g * UINT8_MAX)
            table[i * 3 + 2] = Math.round(b * UINT8_MAX)
        }
        return table
    }, [brightness, contrast, colormap, colormapRange])

    // Per-rank RGB colour table (rank 1..count) for object tinting; index 0 unused.
    const objColorLut = useMemo(() => {
        if (!objectLabeling) return null
        const table = new Uint8ClampedArray((objectLabeling.count + 1) * 3)
        for (let rank = 1; rank <= objectLabeling.count; rank++) {
            const [r, g, b] = objectColorRgb(rank)
            table[rank * 3] = Math.round(r * UINT8_MAX)
            table[rank * 3 + 1] = Math.round(g * UINT8_MAX)
            table[rank * 3 + 2] = Math.round(b * UINT8_MAX)
        }
        return table
    }, [objectLabeling])

    // CSS linear-gradient representing the colormap (bottom = dark, top = bright).
    const colormapCss = useMemo(() => {
        const stops = Array.from({ length: COLORBAR_STOPS }, (_, i) => {
            const idx = Math.round((i / (COLORBAR_STOPS - 1)) * (LUT_SIZE - 1)) * 3
            return `rgb(${lut[idx]},${lut[idx + 1]},${lut[idx + 2]})`
        })
        return `linear-gradient(to top, ${stops.join(', ')})`
    }, [lut])

    // Main canvas draw + segmentation overlay + measurement overlay.
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rafId = requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            canvas.width = canvasW
            canvas.height = canvasH
            const imageData = ctx.createImageData(canvasW, canvasH)
            const pixels = imageData.data

            // Object-colour overlay setup: precompute the region box so each pixel
            // can be mapped to a region-local label index without per-pixel branching
            // on `axis` more than necessary.
            const tinting = showObjectColors && objectLabeling && objColorLut
            const box = objectLabeling?.box
            const labels = objectLabeling?.labels
            // Only tint voxels that are actually visible (at/above the threshold).
            const tintMinValue = Math.round(objectThreshold * UINT8_MAX)

            const sliceStride = height * width
            for (let ny = 0; ny < canvasH; ny++) {
                for (let nx = 0; nx < canvasW; nx++) {
                    let ox: number, oy: number
                    if (orient === 'ccw90') {
                        ox = origW - 1 - ny
                        oy = nx
                    } else if (orient === 'flipH') {
                        ox = origW - 1 - nx
                        oy = ny
                    } else if (orient === 'flip180') {
                        ox = origW - 1 - nx
                        oy = origH - 1 - ny
                    } else {
                        ox = nx
                        oy = ny
                    }

                    // Resolve the volume voxel (s = slice, vh = height, vw = width) for
                    // this canvas pixel; volIdx uses the same mapping per axis.
                    let s: number, vh: number, vw: number
                    if (axis === 'z') {
                        s = sliceIndex
                        vh = oy
                        vw = ox
                    } else if (axis === 'y') {
                        s = oy
                        vh = sliceIndex
                        vw = ox
                    } else {
                        s = ox
                        vh = oy
                        vw = sliceIndex
                    }
                    const volIdx = s * sliceStride + vh * width + vw

                    const lutIdx = normalizedVolume[volIdx] * 3
                    const pi = (ny * canvasW + nx) * 4
                    let r = lut[lutIdx]
                    let g = lut[lutIdx + 1]
                    let b = lut[lutIdx + 2]

                    if (tinting && box && labels && normalizedVolume[volIdx] >= tintMinValue) {
                        const lx = vw - box.x
                        const ly = vh - box.y
                        const lz = s - box.z
                        if (
                            lx >= 0 &&
                            lx < box.w &&
                            ly >= 0 &&
                            ly < box.h &&
                            lz >= 0 &&
                            lz < box.d
                        ) {
                            const rank = labels[lz * box.w * box.h + ly * box.w + lx]
                            if (rank > 0) {
                                const ci = rank * 3
                                r =
                                    r * (1 - OBJECT_TINT_ALPHA) +
                                    objColorLut[ci] * OBJECT_TINT_ALPHA
                                g =
                                    g * (1 - OBJECT_TINT_ALPHA) +
                                    objColorLut[ci + 1] * OBJECT_TINT_ALPHA
                                b =
                                    b * (1 - OBJECT_TINT_ALPHA) +
                                    objColorLut[ci + 2] * OBJECT_TINT_ALPHA
                            }
                        }
                    }

                    // Annotation overlay — semi-transparent label colour over the slice.
                    if (annotationMask) {
                        const lab = annotationMask[volIdx]
                        if (lab > 0 && lab <= ANNO_LUT_MAX) {
                            const ai = lab * 3
                            r =
                                r * (1 - ANNOTATION_TINT_ALPHA) +
                                ANNO_LUT[ai] * ANNOTATION_TINT_ALPHA
                            g =
                                g * (1 - ANNOTATION_TINT_ALPHA) +
                                ANNO_LUT[ai + 1] * ANNOTATION_TINT_ALPHA
                            b =
                                b * (1 - ANNOTATION_TINT_ALPHA) +
                                ANNO_LUT[ai + 2] * ANNOTATION_TINT_ALPHA
                        }
                    }

                    pixels[pi] = r
                    pixels[pi + 1] = g
                    pixels[pi + 2] = b
                    pixels[pi + 3] = UINT8_MAX
                }
            }
            ctx.putImageData(imageData, 0, 0)

            // Measurement overlay — draw on top of the existing canvas pixels.
            if (measuring && measurePoints.length > 0) {
                ctx.save()
                ctx.strokeStyle = palette.accentBlue
                ctx.fillStyle = palette.accentBlue
                ctx.lineWidth = 2 / (zoomRef.current || 1)

                for (const pt of measurePoints) {
                    ctx.beginPath()
                    ctx.arc(pt.cx, pt.cy, MEASURE_RADIUS / (zoomRef.current || 1), 0, Math.PI * 2)
                    ctx.fill()
                }

                if (measurePoints.length === 2) {
                    ctx.beginPath()
                    ctx.moveTo(measurePoints[0].cx, measurePoints[0].cy)
                    ctx.lineTo(measurePoints[1].cx, measurePoints[1].cy)
                    ctx.stroke()
                }

                ctx.restore()
            }

            // Crop-selection rectangle — live drag takes priority over the persisted box.
            if (cropMode) {
                let c0: { cx: number; cy: number } | null = null
                let c1: { cx: number; cy: number } | null = null
                if (cropDrag) {
                    c0 = cropDrag.s
                    c1 = cropDrag.c
                } else if (cropRectOrig) {
                    c0 = origToCanvas(cropRectOrig.ox0, cropRectOrig.oy0, orient, origW, origH)
                    c1 = origToCanvas(cropRectOrig.ox1, cropRectOrig.oy1, orient, origW, origH)
                }
                if (c0 && c1) {
                    const rx = Math.min(c0.cx, c1.cx)
                    const ry = Math.min(c0.cy, c1.cy)
                    const rw = Math.abs(c1.cx - c0.cx)
                    const rh = Math.abs(c1.cy - c0.cy)
                    ctx.save()
                    ctx.fillStyle = CROP_FILL
                    ctx.strokeStyle = CROP_STROKE
                    ctx.lineWidth = 2 / (zoomRef.current || 1)
                    if (cropShape !== 'rect') {
                        // Ellipse inscribed in the drag bounds (cylinder/sphere cross-section).
                        ctx.beginPath()
                        ctx.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2)
                        ctx.fill()
                        ctx.stroke()
                    } else {
                        ctx.fillRect(rx, ry, rw, rh)
                        ctx.strokeRect(rx, ry, rw, rh)
                    }
                    ctx.restore()
                }
            }

            // Scale bar overlay
            const wrapper = canvasWrapperRef.current
            const displayRatio = wrapper
                ? Math.min(wrapper.clientWidth / canvasW, wrapper.clientHeight / canvasH)
                : 1
            const [dz, dy, dx] = voxelSizeUm
            const hUmPerPx = axis === 'y' ? dx : dy
            const vUmPerPx = axis === 'z' ? dx : dz
            drawScaleBars(ctx, canvasW, canvasH, hUmPerPx, vUmPerPx, displayRatio)
        })

        return () => cancelAnimationFrame(rafId)
    }, [
        normalizedVolume,
        axis,
        orient,
        sliceIndex,
        lut,
        height,
        width,
        meta.nSlices,
        origW,
        origH,
        canvasW,
        canvasH,
        measuring,
        measurePoints,
        voxelSizeUm,
        cropMode,
        cropRectOrig,
        cropDrag,
        showObjectColors,
        objectLabeling,
        objColorLut,
        objectThreshold,
        annotationMask,
        annotationVersion,
        cropShape,
    ])

    const applyTransform = useCallback(() => {
        if (!canvasRef.current) return
        canvasRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`
    }, [])

    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            e.preventDefault()
            const wrapper = canvasWrapperRef.current
            if (!wrapper) return
            const rect = wrapper.getBoundingClientRect()
            const factor = e.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR
            const prevZoom = zoomRef.current
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevZoom * factor))
            zoomRef.current = newZoom
            const mx = e.clientX - rect.left - rect.width / 2
            const my = e.clientY - rect.top - rect.height / 2
            panRef.current = {
                x: mx - (mx - panRef.current.x) * (newZoom / prevZoom),
                y: my - (my - panRef.current.y) * (newZoom / prevZoom),
            }
            applyTransform()
            setCursorStyle(
                newZoom > MIN_ZOOM
                    ? measuring
                        ? 'crosshair'
                        : 'grab'
                    : measuring
                      ? 'crosshair'
                      : 'default',
            )
        },
        [applyTransform, measuring],
    )

    // Screen event → canvas pixel coords (accounting for zoom/pan/CSS scaling).
    const eventToCanvas = useCallback(
        (e: React.MouseEvent): { cx: number; cy: number } | null => {
            const wrapper = canvasWrapperRef.current
            const canvas = canvasRef.current
            if (!wrapper || !canvas) return null
            const rect = wrapper.getBoundingClientRect()
            const cssDW = canvas.offsetWidth || canvasW
            const cssDH = canvas.offsetHeight || canvasH
            return screenToCanvas(
                e.clientX - rect.left,
                e.clientY - rect.top,
                rect.width,
                rect.height,
                canvasW,
                canvasH,
                cssDW,
                cssDH,
                zoomRef.current,
                panRef.current.x,
                panRef.current.y,
            )
        },
        [canvasW, canvasH],
    )

    // Map a mouse event to the slice voxel and paint a (gap-free interpolated) stroke.
    const paintAtEvent = useCallback(
        (e: React.MouseEvent) => {
            if (!onPaint) return
            const pt = eventToCanvas(e)
            if (!pt) return
            const { ox, oy } = canvasToOrig(pt.cx, pt.cy, orient, origW, origH)
            const points: StrokePoint[] = []
            const last = lastPaintOrig.current
            if (last) {
                const dx = ox - last.ox
                const dy = oy - last.oy
                const dist = Math.hypot(dx, dy)
                const step = Math.max(1, brushRadius / 2)
                const n = Math.max(1, Math.ceil(dist / step))
                for (let i = 1; i <= n; i++)
                    points.push({ ox: last.ox + (dx * i) / n, oy: last.oy + (dy * i) / n })
            } else {
                points.push({ ox, oy })
            }
            lastPaintOrig.current = { ox, oy }
            onPaint(points, paintLabel)
        },
        [onPaint, eventToCanvas, orient, origW, origH, brushRadius, paintLabel],
    )

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault()
            if (isPaintTool) {
                isPainting.current = true
                lastPaintOrig.current = null
                paintAtEvent(e)
                return
            }
            if (isRectTool || isCircleTool) {
                const pt = eventToCanvas(e)
                if (pt) setCropDrag({ s: pt, c: pt })
                return
            }
            isDragging.current = true
            lastPos.current = { x: e.clientX, y: e.clientY }
            clickStartRef.current = { x: e.clientX, y: e.clientY }
        },
        [isPaintTool, isRectTool, isCircleTool, paintAtEvent, eventToCanvas],
    )

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (isPaintTool) {
                if (isPainting.current) paintAtEvent(e)
                return
            }
            if (isRectTool || isCircleTool) {
                if (!cropDrag) return
                const pt = eventToCanvas(e)
                if (pt) setCropDrag((d) => (d ? { ...d, c: pt } : d))
                return
            }
            if (!isDragging.current) return
            const dx = e.clientX - lastPos.current.x
            const dy = e.clientY - lastPos.current.y
            lastPos.current = { x: e.clientX, y: e.clientY }
            panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
            applyTransform()
        },
        [
            applyTransform,
            isPaintTool,
            isRectTool,
            isCircleTool,
            cropDrag,
            paintAtEvent,
            eventToCanvas,
        ],
    )

    const handleMouseUp = useCallback(
        (e: React.MouseEvent) => {
            isDragging.current = false
            if (isPaintTool) {
                isPainting.current = false
                lastPaintOrig.current = null
                return
            }
            if (isRectTool || isCircleTool) {
                if (cropDrag) {
                    const moved =
                        Math.abs(cropDrag.s.cx - cropDrag.c.cx) > MIN_CROP_DRAG_PX ||
                        Math.abs(cropDrag.s.cy - cropDrag.c.cy) > MIN_CROP_DRAG_PX
                    if (moved) {
                        const a = canvasToOrig(cropDrag.s.cx, cropDrag.s.cy, orient, origW, origH)
                        const b = canvasToOrig(cropDrag.c.cx, cropDrag.c.cy, orient, origW, origH)
                        if (isCircleTool) onCircleCrop?.(a, b)
                        else onCropRect?.(a, b)
                    }
                    setCropDrag(null)
                }
                return
            }
            if (measuring && clickStartRef.current) {
                const dx = Math.abs(e.clientX - clickStartRef.current.x)
                const dy = Math.abs(e.clientY - clickStartRef.current.y)
                if (dx < CLICK_DRAG_TOLERANCE_PX && dy < CLICK_DRAG_TOLERANCE_PX) {
                    const wrapper = canvasWrapperRef.current
                    const canvas = canvasRef.current
                    if (wrapper && canvas) {
                        const rect = wrapper.getBoundingClientRect()
                        const cssDW = canvas.offsetWidth || canvasW
                        const cssDH = canvas.offsetHeight || canvasH
                        const { cx, cy } = screenToCanvas(
                            e.clientX - rect.left,
                            e.clientY - rect.top,
                            rect.width,
                            rect.height,
                            canvasW,
                            canvasH,
                            cssDW,
                            cssDH,
                            zoomRef.current,
                            panRef.current.x,
                            panRef.current.y,
                        )
                        setMeasurePoints((prev) => {
                            if (prev.length >= 2) return [{ cx, cy }]
                            return [...prev, { cx, cy }]
                        })
                    }
                }
            }
            clickStartRef.current = null
        },
        [
            measuring,
            canvasW,
            canvasH,
            isPaintTool,
            isRectTool,
            isCircleTool,
            cropDrag,
            orient,
            origW,
            origH,
            onCropRect,
            onCircleCrop,
        ],
    )

    const resetView = useCallback(() => {
        zoomRef.current = MIN_ZOOM
        panRef.current = { x: 0, y: 0 }
        applyTransform()
        setCursorStyle(measuring ? 'crosshair' : 'default')
    }, [applyTransform, measuring])

    const toggleMeasuring = useCallback(() => {
        setMeasuring((m) => {
            const next = !m
            setCursorStyle(next ? 'crosshair' : zoomRef.current > MIN_ZOOM ? 'grab' : 'default')
            if (!next) setMeasurePoints([])
            return next
        })
    }, [])

    // Distance in mm if 2 points are placed.
    const distanceMm =
        measuring && measurePoints.length === 2
            ? computeDistanceMm(
                  measurePoints[0],
                  measurePoints[1],
                  axis,
                  orient,
                  origW,
                  origH,
                  voxelSizeUm,
              )
            : null

    return (
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
                cursor: isPaintTool || isRectTool || isCircleTool ? 'crosshair' : cursorStyle,
                userSelect: 'none',
                border: `1px solid ${palette.sceneHairline}`,
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
                isDragging.current = false
                isPainting.current = false
                lastPaintOrig.current = null
                if (cropDrag) setCropDrag(null)
            }}
            onDoubleClick={resetView}
        >
            {/* Axis label */}
            <Typography
                variant="caption"
                sx={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    zIndex: 3,
                    px: 0.5,
                    background: palette.overlayScrim,
                    borderRadius: 0.5,
                    color: palette.sceneTextMuted,
                    pointerEvents: 'none',
                }}
            >
                {label}
            </Typography>

            {/* Measure toggle button */}
            <Tooltip title={measuring ? 'Stop measuring' : 'Start measuring'} placement="left">
                <IconButton
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleMeasuring()
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        zIndex: 3,
                        p: 0.6,
                        color: measuring ? palette.accentBlue : palette.sceneTextMuted,
                        background: palette.overlayScrim,
                        borderRadius: 0.5,
                        '&:hover': { background: palette.accentBlueHoverBg },
                    }}
                >
                    {measuring ? (
                        <CloseIcon sx={{ fontSize: 18 }} />
                    ) : (
                        <StraightenIcon sx={{ fontSize: 18 }} />
                    )}
                </IconButton>
            </Tooltip>

            {/* Canvas + colorbar row — colorbar lives outside the image area so it never overlaps content */}
            <Box
                sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'row',
                    overflow: 'hidden',
                    minHeight: 0,
                }}
            >
                {/* Canvas area */}
                <Box
                    ref={canvasWrapperRef}
                    sx={{
                        flex: 1,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 0,
                        minWidth: 0,
                        position: 'relative',
                    }}
                >
                    <canvas
                        ref={canvasRef}
                        style={{
                            transform: 'translate(0px, 0px) scale(1)',
                            transformOrigin: 'center center',
                            imageRendering: 'pixelated',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                        }}
                    />
                </Box>

                {/* Colorbar strip — dedicated side channel, no overlap */}
                <Box
                    sx={{
                        width: 28,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0.5,
                        py: 1,
                        pointerEvents: 'none',
                        flexShrink: 0,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: '0.625rem',
                            lineHeight: 1,
                            opacity: 0.65,
                            color: palette.sceneText,
                        }}
                    >
                        {UINT8_MAX}
                    </Typography>
                    <Box
                        sx={{
                            flex: 1,
                            maxHeight: '55%',
                            width: 10,
                            background: colormapCss,
                            border: `1px solid ${palette.sceneHairline}`,
                            borderRadius: 0.5,
                        }}
                    />
                    <Typography
                        sx={{
                            fontSize: '0.625rem',
                            lineHeight: 1,
                            opacity: 0.65,
                            color: palette.sceneText,
                        }}
                    >
                        0
                    </Typography>
                </Box>
            </Box>

            {/* Live measurement result */}
            {measuring && measurePoints.length === 2 && distanceMm !== null && (
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: 64,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 3,
                        px: 1,
                        py: 0.25,
                        background: palette.overlayScrimStrong,
                        border: `1px solid ${palette.accentBlueBorder}`,
                        borderRadius: 1,
                        pointerEvents: 'none',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <Typography
                        sx={{ fontSize: '0.72rem', color: palette.accentBlue, fontWeight: 600 }}
                    >
                        {distanceMm.toFixed(3)} mm
                    </Typography>
                </Box>
            )}

            {/* Per-panel controls overlay */}
            <Box
                sx={{
                    flexShrink: 0,
                    zIndex: 2,
                    background: palette.controlsScrim,
                    backdropFilter: 'blur(6px)',
                    px: 1.5,
                    py: 0.75,
                    borderTop: `1px solid ${palette.sceneHairlineDim}`,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <Stack spacing={0.25}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography sx={sliceRowLabelSx}>{label}</Typography>
                        <Slider
                            size="small"
                            value={sliceIndex}
                            min={0}
                            max={maxSlice}
                            step={1}
                            onChange={(_, v) => onSliceChange(typeof v === 'number' ? v : v[0])}
                            sx={slicePanelSliderSx}
                        />
                        <Typography sx={sliceRowValueSx}>{sliceIndex}</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography sx={sliceRowLabelSx}>☀</Typography>
                        <Slider
                            size="small"
                            value={brightness}
                            {...RENDER_CONTROL_LIMITS.h5Brightness}
                            onChange={(_, v) =>
                                setSlicePanelControl(fileKey, axis, {
                                    brightness: typeof v === 'number' ? v : v[0],
                                })
                            }
                            sx={slicePanelSliderSx}
                        />
                        <Typography sx={sliceRowValueSx}>{brightness.toFixed(1)}</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography sx={sliceRowLabelSx}>◑</Typography>
                        <Slider
                            size="small"
                            value={contrast}
                            {...RENDER_CONTROL_LIMITS.h5Contrast}
                            onChange={(_, v) =>
                                setSlicePanelControl(fileKey, axis, {
                                    contrast: typeof v === 'number' ? v : v[0],
                                })
                            }
                            sx={slicePanelSliderSx}
                        />
                        <Typography sx={sliceRowValueSx}>{contrast.toFixed(2)}</Typography>
                    </Stack>
                </Stack>
            </Box>
        </Box>
    )
})
