import { IconButton, Slider, Stack } from '@mui/material'
import ClearIcon from '@mui/icons-material/Clear'
import { useViewerStore } from '../../app/store/viewerSlice'
import { SliceLabel, sliderSx, getResetButtonSx } from './SliceSlider.styles'

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
        <Stack
            alignItems="center"
            spacing={1.5}
            sx={{
                position: 'fixed',
                right: 28,
                top: 70,
                bottom: 70,
                background: 'transparent',
                zIndex: 20,
                py: 1,
            }}
        >
            <SliceLabel>{currentSliceIndex === null ? '—' : `${currentSliceIndex}`}</SliceLabel>

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
        </Stack>
    )
}
