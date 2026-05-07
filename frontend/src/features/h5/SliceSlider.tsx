// CHANGED: complex Slider and IconButton styles extracted to SliceSlider.styles.ts
import { Box, IconButton, Slider, Typography } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import { useViewerStore } from '../../app/store/viewerSlice'
import { palette } from '../../shared/theme/palette'
import { sliderSx, getResetButtonSx } from './SliceSlider.styles'

interface SliceSliderProps {
    nSlices: number
}

export default function SliceSlider({ nSlices }: SliceSliderProps) {
    const { currentSliceIndex, setCurrentSliceIndex } = useViewerStore()

    const handleChange = (_: Event, value: number | number[]) => {
        const v = typeof value === 'number' ? value : value[0]
        setCurrentSliceIndex(nSlices - 1 - v)
    }

    const handleReset = () => {
        setCurrentSliceIndex(null)
    }

    const displayValue = currentSliceIndex === null ? nSlices - 1 : nSlices - 1 - currentSliceIndex

    return (
        <Box
            sx={{
                position: 'fixed',
                right: 28,
                top: 70,
                bottom: 70,
                background: 'transparent',
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
            }}
        >
            <Typography
                sx={{
                    color: palette.textDim,
                    fontSize: '0.7rem',
                    letterSpacing: '0.08em',
                    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                }}
            >
                {currentSliceIndex === null ? '—' : `${currentSliceIndex}`}
            </Typography>

            <Slider
                orientation="vertical"
                min={0}
                max={nSlices - 1}
                value={displayValue}
                onChange={handleChange}
                sx={sliderSx}
            />

            <IconButton
                size="small"
                onClick={handleReset}
                disabled={currentSliceIndex === null}
                title="Show full volume"
                sx={getResetButtonSx(currentSliceIndex !== null)}
            >
                <ClearIcon sx={{ fontSize: '0.9rem' }} />
            </IconButton>
        </Box>
    )
}
