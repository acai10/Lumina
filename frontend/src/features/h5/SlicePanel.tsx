import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { useViewerStore, DEFAULT_SLICE_PANEL_CONTROL } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { slicePanelSliderSx } from './H5SliceViewer.styles'

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

function applyToneMap(value: number, brightness: number, contrast: number): number {
    let c = Math.min(value * brightness, 1.0)
    if (c < 0.5) c = 0.5 * Math.pow(2.0 * c, contrast)
    else c = 1.0 - 0.5 * Math.pow(2.0 * (1.0 - c), contrast)
    return Math.round(c * 255)
}

export function SlicePanel({
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
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const zoomRef = useRef(1)
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
        const table = new Uint8Array(256)
        for (let i = 0; i < 256; i++) {
            table[i] = applyToneMap(i / 255, brightness, contrast)
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
                        volIdx = sliceIndex * height * width + oy * width + ox
                    } else if (axis === 'y') {
                        volIdx = oy * height * width + sliceIndex * width + ox
                    } else {
                        volIdx = ox * height * width + oy * width + sliceIndex
                    }

                    const byte = lut[normalizedVolume[volIdx]]
                    const pi = (ny * canvasW + nx) * 4
                    pixels[pi] = byte
                    pixels[pi + 1] = byte
                    pixels[pi + 2] = byte
                    pixels[pi + 3] = 255
                }
            }
            ctx.putImageData(imageData, 0, 0)
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
    ])

    const applyTransform = useCallback(() => {
        if (!canvasRef.current) return
        canvasRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`
    }, [])

    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            e.preventDefault()
            const rect = containerRef.current!.getBoundingClientRect()
            const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05
            const prevZoom = zoomRef.current
            const newZoom = Math.max(1, Math.min(20, prevZoom * factor))
            zoomRef.current = newZoom
            const mx = e.clientX - rect.left - rect.width / 2
            const my = e.clientY - rect.top - rect.height / 2
            panRef.current = {
                x: mx - (mx - panRef.current.x) * (newZoom / prevZoom),
                y: my - (my - panRef.current.y) * (newZoom / prevZoom),
            }
            applyTransform()
            setCursorStyle(newZoom > 1 ? 'grab' : 'default')
        },
        [applyTransform],
    )

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
        zoomRef.current = 1
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
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 1,
                display: 'flex',
                flexDirection: 'column',
            }}
            onWheel={handleWheel}
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
                    background: 'rgba(0,0,0,0.55)',
                    borderRadius: 0.5,
                    color: 'text.secondary',
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
                sx={{
                    flexShrink: 0,
                    zIndex: 2,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(6px)',
                    px: 1.5,
                    py: 0.75,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
            >
                <Stack spacing={0.25}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 16,
                                flexShrink: 0,
                            }}
                        >
                            {label}
                        </Typography>
                        <Slider
                            size="small"
                            value={sliceIndex}
                            min={0}
                            max={maxSlice}
                            step={1}
                            onChange={(_, v) => onSliceChange(v as number)}
                            sx={slicePanelSliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 24,
                                textAlign: 'right',
                                flexShrink: 0,
                            }}
                        >
                            {sliceIndex}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 16,
                                flexShrink: 0,
                            }}
                        >
                            ☀
                        </Typography>
                        <Slider
                            size="small"
                            value={brightness}
                            min={0}
                            max={10}
                            step={0.1}
                            onChange={(_, v) =>
                                setSlicePanelControl(fileKey, axis, { brightness: v as number })
                            }
                            sx={slicePanelSliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 24,
                                textAlign: 'right',
                                flexShrink: 0,
                            }}
                        >
                            {brightness.toFixed(1)}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 16,
                                flexShrink: 0,
                            }}
                        >
                            ◑
                        </Typography>
                        <Slider
                            size="small"
                            value={contrast}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(_, v) =>
                                setSlicePanelControl(fileKey, axis, { contrast: v as number })
                            }
                            sx={slicePanelSliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: 'text.secondary',
                                width: 24,
                                textAlign: 'right',
                                flexShrink: 0,
                            }}
                        >
                            {contrast.toFixed(2)}
                        </Typography>
                    </Stack>
                </Stack>
            </Box>
        </Box>
    )
}
