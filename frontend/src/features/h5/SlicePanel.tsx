import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { useViewerStore, DEFAULT_SLICE_PANEL_CONTROL } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { palette } from '../../shared/theme/palette'
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
}

// Uint8 channel range — the normalised volume and tone-map output are 0..255.
const UINT8_MAX = 255
// Tone-map LUT covers every possible Uint8 input value.
const LUT_SIZE = 256
// Midpoint the S-curve pivots around; each half [0..pivot]/[pivot..1] is normalised
// to [0..1] via `/ TONE_MAP_PIVOT` (= ×2) before the contrast power is applied.
const TONE_MAP_PIVOT = 0.5

function applyToneMap(value: number, brightness: number, contrast: number): number {
    let c = Math.min(value * brightness, 1.0)
    if (c < TONE_MAP_PIVOT) c = TONE_MAP_PIVOT * Math.pow(c / TONE_MAP_PIVOT, contrast)
    else c = 1.0 - TONE_MAP_PIVOT * Math.pow((1.0 - c) / TONE_MAP_PIVOT, contrast)
    return Math.round(c * UINT8_MAX)
}

// Zoom: each wheel tick multiplies/divides by ZOOM_STEP_FACTOR, clamped to [MIN, MAX].
const ZOOM_STEP_FACTOR = 1.05
const MIN_ZOOM = 1
const MAX_ZOOM = 20

export const SlicePanel = memo(function SlicePanel({
    normalizedVolume,
    meta,
    axis,
    sliceIndex,
    fileKey,
    label,
    orient,
    onSliceChange,
}: SlicePanelProps) {
    const { nSlices, height, width } = meta
    const maxSlice = axis === 'z' ? nSlices - 1 : axis === 'y' ? height - 1 : width - 1
    // A backend filter can replace the volume with different dims while the
    // stored per-file slice index still points past the new extent — clamp so
    // the pixel loop never reads out of bounds (and the slider never exceeds max).
    const clampedSliceIndex = Math.min(sliceIndex, maxSlice)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const controlsRef = useRef<HTMLDivElement>(null)
    const zoomRef = useRef(MIN_ZOOM)
    const panRef = useRef({ x: 0, y: 0 })
    // cursor is the only piece of zoom/pan state that must trigger a re-render
    const [cursorStyle, setCursorStyle] = useState<'grab' | 'default'>('default')
    const isDragging = useRef(false)
    const lastPos = useRef({ x: 0, y: 0 })

    const { brightness, contrast } = useViewerStore(
        (s) =>
            s.h5PerFileStates[fileKey]?.slicePanelControls?.[axis] ?? DEFAULT_SLICE_PANEL_CONTROL,
    )
    const setSlicePanelControl = useViewerStore((s) => s.setSlicePanelControl)

    // Native dimensions per axis (before orientation transform)
    const origW = axis === 'x' ? nSlices : width
    const origH = axis === 'y' ? nSlices : height
    // Canvas output dimensions after orientation
    const canvasW = orient === 'ccw90' ? origH : origW
    const canvasH = orient === 'ccw90' ? origW : origH

    // Precompute a 256-entry tone-map LUT for the current brightness/contrast.
    // This replaces ~500 000 Math.pow() calls per frame (for a 697×694 canvas)
    // with ~500 000 O(1) array lookups — roughly 5–10× faster canvas redraws.
    const lut = useMemo(() => {
        const table = new Uint8Array(LUT_SIZE)
        for (let i = 0; i < LUT_SIZE; i++) {
            table[i] = applyToneMap(i / UINT8_MAX, brightness, contrast)
        }
        return table
    }, [brightness, contrast])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        // Schedule the expensive pixel loop on the next animation frame so that
        // rapid slider drags never queue more than one pending repaint.
        let rafId = requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            canvas.width = canvasW
            canvas.height = canvasH
            const imageData = ctx.createImageData(canvasW, canvasH)
            const pixels = imageData.data

            // Voxels per slice — loop-invariant, hoisted out of the per-pixel hot loop.
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

                    let volIdx: number
                    if (axis === 'z') {
                        volIdx = clampedSliceIndex * sliceStride + oy * width + ox
                    } else if (axis === 'y') {
                        volIdx = oy * sliceStride + clampedSliceIndex * width + ox
                    } else {
                        volIdx = ox * sliceStride + oy * width + clampedSliceIndex
                    }

                    const byte = lut[normalizedVolume[volIdx]]
                    const pi = (ny * canvasW + nx) * 4
                    pixels[pi] = byte
                    pixels[pi + 1] = byte
                    pixels[pi + 2] = byte
                    pixels[pi + 3] = UINT8_MAX
                }
            }
            ctx.putImageData(imageData, 0, 0)
        })

        return () => cancelAnimationFrame(rafId)
    }, [
        normalizedVolume,
        axis,
        orient,
        clampedSliceIndex,
        lut,
        height,
        width,
        meta.nSlices,
        origW,
        origH,
        canvasW,
        canvasH,
    ])

    const applyTransform = useCallback(() => {
        if (!canvasRef.current) return
        canvasRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`
    }, [])

    const handleWheel = useCallback(
        (e: WheelEvent) => {
            // Wheel events over the controls overlay (sliders) must not zoom.
            if (controlsRef.current?.contains(e.target as Node)) return
            e.preventDefault()
            const container = containerRef.current
            if (!container) return
            const rect = container.getBoundingClientRect()
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
            setCursorStyle(newZoom > MIN_ZOOM ? 'grab' : 'default')
        },
        [applyTransform],
    )

    // React 18 delegates `wheel` as a passive listener, so preventDefault() in a
    // synthetic onWheel handler is a no-op (the page scrolls while zooming).
    // Attach a native non-passive listener instead.
    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener('wheel', handleWheel, { passive: false })
        return () => el.removeEventListener('wheel', handleWheel)
    }, [handleWheel])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
        e.preventDefault()
    }, [])

    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!isDragging.current) return
            const dx = e.clientX - lastPos.current.x
            const dy = e.clientY - lastPos.current.y
            lastPos.current = { x: e.clientX, y: e.clientY }
            panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
            applyTransform()
        },
        [applyTransform],
    )

    const handleMouseUp = useCallback(() => {
        isDragging.current = false
    }, [])

    const resetView = useCallback(() => {
        zoomRef.current = MIN_ZOOM
        panRef.current = { x: 0, y: 0 }
        applyTransform()
        setCursorStyle('default')
    }, [applyTransform])

    return (
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
                cursor: cursorStyle,
                userSelect: 'none',
                border: `1px solid ${palette.sceneHairline}`,
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={resetView}
        >
            {/* Axis label */}
            <Typography
                variant="caption"
                sx={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    zIndex: 2,
                    px: 0.5,
                    background: palette.overlayScrim,
                    borderRadius: 0.5,
                    color: palette.sceneTextMuted,
                    pointerEvents: 'none',
                }}
            >
                {label}
            </Typography>

            {/* Canvas area */}
            <Box
                sx={{
                    flex: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 0,
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

            {/* Per-panel controls overlay */}
            <Box
                ref={controlsRef}
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
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <Stack spacing={0.25}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography sx={sliceRowLabelSx}>{label}</Typography>
                        <Slider
                            size="small"
                            value={clampedSliceIndex}
                            min={0}
                            max={maxSlice}
                            step={1}
                            onChange={(_, v) => onSliceChange(typeof v === 'number' ? v : v[0])}
                            sx={slicePanelSliderSx}
                        />
                        <Typography sx={sliceRowValueSx}>{clampedSliceIndex}</Typography>
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
