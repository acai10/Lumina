import { palette } from '../../shared/theme/palette'

export const slicePanelSliderSx = {
    color: palette.tealBorder,
    py: 0,
    '& .MuiSlider-thumb': { width: 10, height: 10 },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}
