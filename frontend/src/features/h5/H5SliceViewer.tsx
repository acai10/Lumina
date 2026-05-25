import { Box } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'
import { SlicePanel } from './SlicePanel'

interface H5SliceViewerProps {
    normalizedVolume: Float32Array
    meta: H5Meta
    fileKey: string
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
