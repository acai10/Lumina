import { useEffect, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { palette } from '../../shared/theme/palette'

interface Props {
    data: Float32Array
    shape: [number, number]
    title?: string
}

const CANVAS_MAX_PX = 512
const UINT8_MAX = 255

export default function MipViewer({ data, shape, title = 'MIP — Top View' }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [brightness, setBrightness] = useState(1.0)
    const [contrast, setContrast] = useState(1.0)

    const [height, width] = shape

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        // Schedule the pixel loop on the next frame so rapid slider drags never queue
        // more than one pending repaint.
        const rafId = requestAnimationFrame(() => {
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            const imageData = ctx.createImageData(width, height)
            const pixels = imageData.data

            for (let i = 0; i < data.length; i++) {
                // Apply brightness and contrast: clamp(contrast*(v-0.5) + 0.5 + brightness-1, 0, 1)
                const v = Math.max(
                    0,
                    Math.min(1, contrast * (data[i] - 0.5) + 0.5 + (brightness - 1)),
                )
                const byte = Math.round(v * UINT8_MAX)
                const pi = i * 4
                pixels[pi] = byte
                pixels[pi + 1] = byte
                pixels[pi + 2] = byte
                pixels[pi + 3] = UINT8_MAX
            }

            ctx.putImageData(imageData, 0, 0)
        })

        return () => cancelAnimationFrame(rafId)
    }, [data, width, height, brightness, contrast])

    // Scale canvas display size while keeping it square-ish and capped
    const scale = Math.min(CANVAS_MAX_PX / Math.max(width, height), 1)
    const displayW = Math.round(width * scale)
    const displayH = Math.round(height * scale)

    return (
        <Box>
            <Typography
                variant="caption"
                sx={{
                    color: palette.textSecondary,
                    letterSpacing: '0.06em',
                    mb: 1,
                    display: 'block',
                }}
            >
                {title}
            </Typography>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    width: displayW,
                    height: displayH,
                    border: `1px solid ${palette.borderGlass}`,
                    display: 'block',
                    imageRendering: 'pixelated',
                }}
            />
            <Stack spacing={0.5} sx={{ mt: 1.5, maxWidth: displayW }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" sx={{ color: palette.textMuted, width: '72px' }}>
                        Brightness
                    </Typography>
                    <Slider
                        size="small"
                        min={0.1}
                        max={2}
                        step={0.05}
                        value={brightness}
                        onChange={(_, v) => setBrightness(typeof v === 'number' ? v : v[0])}
                        sx={{ color: palette.primary }}
                    />
                </Stack>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="caption" sx={{ color: palette.textMuted, width: '72px' }}>
                        Contrast
                    </Typography>
                    <Slider
                        size="small"
                        min={0.1}
                        max={3}
                        step={0.05}
                        value={contrast}
                        onChange={(_, v) => setContrast(typeof v === 'number' ? v : v[0])}
                        sx={{ color: palette.primary }}
                    />
                </Stack>
            </Stack>
        </Box>
    )
}
