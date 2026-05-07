import { Box, IconButton, Slider, Typography } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import { useViewerStore } from '../../app/store/viewerSlice'
import { palette } from '../../shared/theme/palette'

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
                sx={{
                    flex: 1,
                    color: palette.tealBorder,
                    '& .MuiSlider-thumb': {
                        width: 14,
                        height: 14,
                        '&:hover': { boxShadow: `0 0 0 8px ${palette.cyanHoverRing}` },
                    },
                    '& .MuiSlider-track': { width: 3, opacity: 0.8 },
                    '& .MuiSlider-rail': { width: 3, opacity: 0.3 },
                }}
            />

            <IconButton
                size="small"
                onClick={handleReset}
                disabled={currentSliceIndex === null}
                title="Show full volume"
                sx={{
                    width: 28,
                    height: 28,
                    border: `1px solid ${currentSliceIndex !== null ? palette.cyanBorder : 'rgba(100,200,255,0.12)'}`,
                    borderRadius: '6px',
                    color: currentSliceIndex !== null ? palette.cyan : palette.textFaint,
                    transition: 'color 0.2s, border-color 0.2s, box-shadow 0.2s',
                    '&:hover:not(.Mui-disabled)': {
                        boxShadow: `0 0 10px 2px ${palette.cyanGlow}`,
                        borderColor: palette.cyan,
                    },
                }}
            >
                <ClearIcon sx={{ fontSize: '0.9rem' }} />
            </IconButton>
        </Box>
    )
}
