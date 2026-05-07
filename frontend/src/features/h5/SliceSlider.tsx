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
        setCurrentSliceIndex(typeof value === 'number' ? value : value[0])
    }

    const handleReset = () => {
        setCurrentSliceIndex(null)
    }

    const displayValue = currentSliceIndex ?? Math.floor(nSlices / 2)

    return (
        <Box
            sx={{
                position: 'fixed',
                bottom: 28,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '80%',
                maxWidth: 800,
                background: palette.panelBg,
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                px: 4,
                py: 2,
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography
                    sx={{ color: palette.textDim, fontSize: '0.75rem', letterSpacing: '0.08em' }}
                >
                    SLICE
                </Typography>
                <Typography sx={{ color: palette.textPrimary, fontSize: '0.8rem' }}>
                    {currentSliceIndex === null
                        ? 'All slices'
                        : `${currentSliceIndex} / ${nSlices - 1}`}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Slider
                    min={0}
                    max={nSlices - 1}
                    value={displayValue}
                    onChange={handleChange}
                    sx={{
                        flex: 1,
                        color: palette.cyan,
                        '& .MuiSlider-thumb': {
                            width: 16,
                            height: 16,
                            '&:hover': { boxShadow: `0 0 0 8px ${palette.cyanHoverRing}` },
                        },
                        '& .MuiSlider-track': { height: 3 },
                        '& .MuiSlider-rail': { height: 3, opacity: 0.3 },
                    }}
                />
                <IconButton
                    size="small"
                    onClick={handleReset}
                    disabled={currentSliceIndex === null}
                    title="Show full volume"
                    sx={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
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
                    <ClearIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
            </Box>
        </Box>
    )
}
