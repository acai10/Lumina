import { useEffect, useRef } from 'react'
import { Box } from '@mui/material'
import { useViewerStore, defaultRenderControls } from '../../app/store/viewerSlice'
import type { H5Meta } from '../../shared/types/viewer.types'

interface H5SliceViewerProps {
    normalizedVolume: Float32Array
    meta: H5Meta
    fileKey: string
}

export default function H5SliceViewer({ normalizedVolume, meta, fileKey }: H5SliceViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const { h5Brightness, h5Contrast } = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.renderControls ?? defaultRenderControls,
    )
    const sliceIndex = useViewerStore(
        (s) => s.h5PerFileStates[fileKey]?.sliceIndex ?? Math.floor(meta.nSlices / 2),
    )

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const { height, width } = meta
        canvas.width = width
        canvas.height = height

        const sliceOffset = sliceIndex * height * width
        const imageData = ctx.createImageData(width, height)
        for (let i = 0; i < height * width; i++) {
            let c = Math.min(normalizedVolume[sliceOffset + i] * h5Brightness, 1.0)
            if (c < 0.5) c = 0.5 * Math.pow(2.0 * c, h5Contrast)
            else c = 1.0 - 0.5 * Math.pow(2.0 * (1.0 - c), h5Contrast)
            const byte = Math.round(c * 255)
            imageData.data[i * 4] = byte
            imageData.data[i * 4 + 1] = byte
            imageData.data[i * 4 + 2] = byte
            imageData.data[i * 4 + 3] = 255
        }
        ctx.putImageData(imageData, 0, 0)
    }, [normalizedVolume, meta, sliceIndex, h5Brightness, h5Contrast])

    return (
        <Box
            sx={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    imageRendering: 'pixelated',
                }}
            />
        </Box>
    )
}
