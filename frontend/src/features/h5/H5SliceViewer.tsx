import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { useViewerStore, DEFAULT_SLICE_PANEL_CONTROL } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { palette } from '../../shared/theme/palette'

interface H5SliceViewerProps {
    normalizedVolume: Float32Array
    meta: H5Meta
    fileKey: string
}

interface SlicePanelProps {
    normalizedVolume: Float32Array
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

const sliderSx = {
    color: palette.tealBorder,
    py: 0,
    '& .MuiSlider-thumb': { width: 10, height: 10 },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

function SlicePanel({
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
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
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

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        canvas.width = canvasW
        canvas.height = canvasH
        const imageData = ctx.createImageData(canvasW, canvasH)

        for (let ny = 0; ny < canvasH; ny++) {
            for (let nx = 0; nx < canvasW; nx++) {
                // Map output pixel back to native axis coordinates
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

                const byte = applyToneMap(normalizedVolume[volIdx], brightness, contrast)
                const pi = (ny * canvasW + nx) * 4
                imageData.data[pi] = byte
                imageData.data[pi + 1] = byte
                imageData.data[pi + 2] = byte
                imageData.data[pi + 3] = 255
            }
        }
        ctx.putImageData(imageData, 0, 0)
    }, [
        normalizedVolume,
        axis,
        orient,
        sliceIndex,
        brightness,
        contrast,
        origW,
        origH,
        canvasW,
        canvasH,
        height,
        width,
    ])

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        const rect = containerRef.current!.getBoundingClientRect()
        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05
        setZoom((prev) => {
            const newZoom = Math.max(1, Math.min(20, prev * factor))
            const mx = e.clientX - rect.left - rect.width / 2
            const my = e.clientY - rect.top - rect.height / 2
            setPan((p) => ({
                x: mx - (mx - p.x) * (newZoom / prev),
                y: my - (my - p.y) * (newZoom / prev),
            }))
            return newZoom
        })
    }, [])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
        e.preventDefault()
    }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return
        const dx = e.clientX - lastPos.current.x
        const dy = e.clientY - lastPos.current.y
        lastPos.current = { x: e.clientX, y: e.clientY }
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
    }, [])

    const handleMouseUp = useCallback(() => {
        isDragging.current = false
    }, [])

    const resetView = useCallback(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [])

    return (
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
                cursor: zoom > 1 ? 'grab' : 'default',
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
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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
                                color: palette.textDim,
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
                            sx={sliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: palette.textDim,
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
                                color: palette.textDim,
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
                            sx={sliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: palette.textDim,
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
                                color: palette.textDim,
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
                            sx={sliderSx}
                        />
                        <Typography
                            sx={{
                                fontSize: '0.62rem',
                                color: palette.textDim,
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

export default function H5SliceViewer({ normalizedVolume, meta, fileKey }: H5SliceViewerProps) {
    const sliceZ = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.sliceIndex ?? Math.floor(meta.nSlices / 2),
    )
    const sliceY = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.sliceY ?? Math.floor(meta.height / 2),
    )
    const sliceX = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.sliceX ?? Math.floor(meta.width / 2),
    )
    const setH5SliceIndex = useViewerStore((s) => s.setH5SliceIndex)
    const setH5SliceY = useViewerStore((s) => s.setH5SliceY)
    const setH5SliceX = useViewerStore((s) => s.setH5SliceX)

    const common = { normalizedVolume, meta, fileKey }

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gridTemplateRows: '1fr 1fr',
                gap: 0.5,
                pt: 0.5,
                pr: 0.5,
                pb: 0.5,
                pl: '270px',
            }}
        >
            {/* axis="z" navigates s → maps to Y-axis in 3D space */}
            <SlicePanel
                {...common}
                axis="z"
                sliceIndex={sliceZ}
                label="Y"
                orient="ccw90"
                onSliceChange={(v) => setH5SliceIndex(fileKey, v)}
            />
            {/* axis="y" navigates h → maps to Z-axis in 3D space */}
            <SlicePanel
                {...common}
                axis="y"
                sliceIndex={sliceY}
                label="Z"
                orient="flip180"
                onSliceChange={(v) => setH5SliceY(fileKey, v)}
            />
            {/* axis="x" navigates w → X-axis */}
            <Box sx={{ gridColumn: '1 / -1', overflow: 'hidden', height: '100%' }}>
                <SlicePanel
                    {...common}
                    axis="x"
                    sliceIndex={sliceX}
                    label="X"
                    orient="ccw90"
                    onSliceChange={(v) => setH5SliceX(fileKey, v)}
                />
            </Box>
        </Box>
    )
}
