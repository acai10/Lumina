import { useCallback } from 'react'
import { Box } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5Meta, SegmentationOverlay } from '../../shared/types/viewer.types'
import { SlicePanel } from './SlicePanel'
import { DEFAULT_VOXEL_SIZE_UM } from '../../shared/constants'

interface H5SliceViewerProps {
    normalizedVolume: Uint8Array
    meta: H5Meta
    fileKey: string
}

// Stable reference — prevents useShallow from seeing a new array every render
// when segmentationOverlays is undefined in the store (?? [] creates a fresh []).
const EMPTY_OVERLAYS: SegmentationOverlay[] = []
const DEFAULT_COLORMAP_RANGE: [number, number] = [0, 1]

export default function H5SliceViewer({ normalizedVolume, meta, fileKey }: H5SliceViewerProps) {
    const {
        sliceZ,
        sliceY,
        sliceX,
        setH5SliceIndex,
        setH5SliceY,
        setH5SliceX,
        segmentationOverlays,
        sliceColormap,
        colormapRange,
        voxelSizeUm,
    } = useViewerStore(
        useShallow((s) => ({
            sliceZ: s.h5PerFileStates[fileKey]?.sliceIndex ?? Math.floor(meta.nSlices / 2),
            sliceY: s.h5PerFileStates[fileKey]?.sliceY ?? Math.floor(meta.height / 2),
            sliceX: s.h5PerFileStates[fileKey]?.sliceX ?? Math.floor(meta.width / 2),
            setH5SliceIndex: s.setH5SliceIndex,
            setH5SliceY: s.setH5SliceY,
            setH5SliceX: s.setH5SliceX,
            segmentationOverlays:
                s.h5PerFileStates[fileKey]?.segmentationOverlays ?? EMPTY_OVERLAYS,
            sliceColormap: s.h5PerFileStates[fileKey]?.sliceColormap ?? 'gray',
            colormapRange: s.h5PerFileStates[fileKey]?.sliceColormapRange ?? DEFAULT_COLORMAP_RANGE,
            voxelSizeUm: s.h5PerFileStates[fileKey]?.sliceVoxelSizeUm ?? DEFAULT_VOXEL_SIZE_UM,
        })),
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
                segmentationOverlays={segmentationOverlays}
                voxelSizeUm={voxelSizeUm}
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
            />
        </Box>
    )
}
