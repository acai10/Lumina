import { useCallback } from 'react'
import { Box } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { SlicePanel } from './SlicePanel'

interface H5SliceViewerProps {
    normalizedVolume: Uint8Array
    meta: H5Meta
    fileKey: string
}

export default function H5SliceViewer({ normalizedVolume, meta, fileKey }: H5SliceViewerProps) {
    const { sliceZ, sliceY, sliceX, setH5SliceIndex, setH5SliceY, setH5SliceX } = useViewerStore(
        useShallow((s) => ({
            sliceZ: s.h5PerFileStates[fileKey]?.sliceIndex ?? Math.floor(meta.nSlices / 2),
            sliceY: s.h5PerFileStates[fileKey]?.sliceY ?? Math.floor(meta.height / 2),
            sliceX: s.h5PerFileStates[fileKey]?.sliceX ?? Math.floor(meta.width / 2),
            setH5SliceIndex: s.setH5SliceIndex,
            setH5SliceY: s.setH5SliceY,
            setH5SliceX: s.setH5SliceX,
        })),
    )

    // Stable per-axis callbacks so the memoized SlicePanels don't re-render (and
    // re-run their ~500k-pixel repaint) when a sibling panel's slider fires.
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
                normalizedVolume={normalizedVolume}
                meta={meta}
                fileKey={fileKey}
                axis="z"
                sliceIndex={sliceZ}
                label="Y"
                orient="ccw90"
                onSliceChange={onSliceChangeZ}
            />
            {/* axis="y" navigates h → maps to Z-axis in 3D space */}
            <SlicePanel
                normalizedVolume={normalizedVolume}
                meta={meta}
                fileKey={fileKey}
                axis="y"
                sliceIndex={sliceY}
                label="Z"
                orient="flip180"
                onSliceChange={onSliceChangeY}
            />
            {/* axis="x" navigates w → X-axis */}
            <Box sx={{ gridColumn: '1 / -1', overflow: 'hidden', height: '100%' }}>
                <SlicePanel
                    normalizedVolume={normalizedVolume}
                    meta={meta}
                    fileKey={fileKey}
                    axis="x"
                    sliceIndex={sliceX}
                    label="X"
                    orient="ccw90"
                    onSliceChange={onSliceChangeX}
                />
            </Box>
        </Box>
    )
}
