import { useCallback, useMemo } from 'react'
import { Box } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore, fullVolumeCropBox } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { SlicePanel } from './SlicePanel'
import { DEFAULT_VOXEL_SIZE_UM, DEFAULT_COLORMAP_RANGE } from '../../shared/constants'

interface H5SliceViewerProps {
    normalizedVolume: Uint8Array
    meta: H5Meta
    fileKey: string
}

// Clamp/round a drag span to whole-voxel [lo, hi) within [0, max], min size 1.
function clampRange(v0: number, v1: number, max: number): [number, number] {
    const lo = Math.max(0, Math.min(Math.round(Math.min(v0, v1)), max))
    let hi = Math.max(0, Math.min(Math.round(Math.max(v0, v1)), max))
    if (hi - lo < 1) hi = Math.min(max, lo + 1)
    return [lo, hi]
}

export default function H5SliceViewer({ normalizedVolume, meta, fileKey }: H5SliceViewerProps) {
    const {
        sliceZ,
        sliceY,
        sliceX,
        setH5SliceIndex,
        setH5SliceY,
        setH5SliceX,
        sliceColormap,
        colormapRange,
        voxelSizeUm,
        cropMode,
        cropBox,
        setCropBox,
    } = useViewerStore(
        useShallow((s) => ({
            sliceZ: s.h5PerFileStates[fileKey]?.sliceIndex ?? Math.floor(meta.nSlices / 2),
            sliceY: s.h5PerFileStates[fileKey]?.sliceY ?? Math.floor(meta.height / 2),
            sliceX: s.h5PerFileStates[fileKey]?.sliceX ?? Math.floor(meta.width / 2),
            setH5SliceIndex: s.setH5SliceIndex,
            setH5SliceY: s.setH5SliceY,
            setH5SliceX: s.setH5SliceX,
            sliceColormap: s.h5PerFileStates[fileKey]?.sliceColormap ?? 'gray',
            colormapRange: s.h5PerFileStates[fileKey]?.sliceColormapRange ?? DEFAULT_COLORMAP_RANGE,
            voxelSizeUm: s.h5PerFileStates[fileKey]?.sliceVoxelSizeUm ?? DEFAULT_VOXEL_SIZE_UM,
            cropMode: s.h5PerFileStates[fileKey]?.cropMode ?? false,
            cropBox: s.h5PerFileStates[fileKey]?.cropBox,
            setCropBox: s.setCropBox,
        })),
    )

    const cb = useMemo(() => cropBox ?? fullVolumeCropBox(meta), [cropBox, meta])

    // Per-panel crop handlers: each panel constrains two of the three volume axes.
    const onCropZ = useCallback(
        (a: { ox: number; oy: number }, b: { ox: number; oy: number }) => {
            const [x0, x1] = clampRange(a.ox, b.ox, meta.width)
            const [y0, y1] = clampRange(a.oy, b.oy, meta.height)
            setCropBox(fileKey, { ...cb, x: x0, w: x1 - x0, y: y0, h: y1 - y0 })
        },
        [cb, fileKey, meta, setCropBox],
    )
    const onCropY = useCallback(
        (a: { ox: number; oy: number }, b: { ox: number; oy: number }) => {
            const [x0, x1] = clampRange(a.ox, b.ox, meta.width)
            const [z0, z1] = clampRange(a.oy, b.oy, meta.nSlices)
            setCropBox(fileKey, { ...cb, x: x0, w: x1 - x0, z: z0, d: z1 - z0 })
        },
        [cb, fileKey, meta, setCropBox],
    )
    const onCropX = useCallback(
        (a: { ox: number; oy: number }, b: { ox: number; oy: number }) => {
            const [z0, z1] = clampRange(a.ox, b.ox, meta.nSlices)
            const [y0, y1] = clampRange(a.oy, b.oy, meta.height)
            setCropBox(fileKey, { ...cb, z: z0, d: z1 - z0, y: y0, h: y1 - y0 })
        },
        [cb, fileKey, meta, setCropBox],
    )

    const cropRectZ = useMemo(
        () => ({ ox0: cb.x, oy0: cb.y, ox1: cb.x + cb.w, oy1: cb.y + cb.h }),
        [cb],
    )
    const cropRectY = useMemo(
        () => ({ ox0: cb.x, oy0: cb.z, ox1: cb.x + cb.w, oy1: cb.z + cb.d }),
        [cb],
    )
    const cropRectX = useMemo(
        () => ({ ox0: cb.z, oy0: cb.y, ox1: cb.z + cb.d, oy1: cb.y + cb.h }),
        [cb],
    )

    const onSliceChangeZ = useCallback(
        (v: number) => setH5SliceIndex(fileKey, v),
        [setH5SliceIndex, fileKey],
    )
    const onSliceChangeY = useCallback(
        (v: number) => setH5SliceY(fileKey, v),
        [setH5SliceY, fileKey],
    )
    const onSliceChangeX = useCallback(
        (v: number) => setH5SliceX(fileKey, v),
        [setH5SliceX, fileKey],
    )

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gridTemplateRows: '1fr',
                gap: 0.5,
                p: 0.5,
            }}
        >
            {/* XZ — navigates slices (z-axis in data space) */}
            <SlicePanel
                normalizedVolume={normalizedVolume}
                meta={meta}
                fileKey={fileKey}
                axis="z"
                sliceIndex={sliceZ}
                label="XZ"
                orient="ccw90"
                onSliceChange={onSliceChangeZ}
                colormap={sliceColormap}
                colormapRange={colormapRange}
                voxelSizeUm={voxelSizeUm}
                cropMode={cropMode}
                cropRectOrig={cropRectZ}
                onCropRect={onCropZ}
            />
            {/* XY — navigates height (y-axis in data space) */}
            <SlicePanel
                normalizedVolume={normalizedVolume}
                meta={meta}
                fileKey={fileKey}
                axis="y"
                sliceIndex={sliceY}
                label="XY"
                orient="flip180"
                onSliceChange={onSliceChangeY}
                colormap={sliceColormap}
                colormapRange={colormapRange}
                voxelSizeUm={voxelSizeUm}
                cropMode={cropMode}
                cropRectOrig={cropRectY}
                onCropRect={onCropY}
            />
            {/* YZ — navigates width (x-axis in data space) */}
            <SlicePanel
                normalizedVolume={normalizedVolume}
                meta={meta}
                fileKey={fileKey}
                axis="x"
                sliceIndex={sliceX}
                label="YZ"
                orient="ccw90"
                onSliceChange={onSliceChangeX}
                colormap={sliceColormap}
                colormapRange={colormapRange}
                voxelSizeUm={voxelSizeUm}
                cropMode={cropMode}
                cropRectOrig={cropRectX}
                onCropRect={onCropX}
            />
        </Box>
    )
}
