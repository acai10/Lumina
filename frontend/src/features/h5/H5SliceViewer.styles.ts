import { palette } from '../../shared/theme/palette'

export const slicePanelSliderSx = {
    color: palette.tealBorder,
    py: 0,
    '& .MuiSlider-thumb': { width: 10, height: 10 },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

/** Left label cell of a SlicePanel control row (slice / brightness / contrast). */
export const sliceRowLabelSx = {
    fontSize: '0.62rem',
    color: 'text.secondary',
    width: 16,
    flexShrink: 0,
}

/** Right value-readout cell of a SlicePanel control row. */
export const sliceRowValueSx = {
    fontSize: '0.62rem',
    color: 'text.secondary',
    width: 24,
    textAlign: 'right',
    flexShrink: 0,
} as const
