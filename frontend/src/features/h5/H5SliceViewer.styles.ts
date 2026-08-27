/** Slider and label styles shared by the three slice panels. */
import { palette } from '../../shared/theme/palette'

export const slicePanelSliderSx = {
    color: palette.sceneAccent,
    py: 0,
    '& .MuiSlider-thumb': { width: '10px', height: '10px' },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

/** Left label cell of a SlicePanel control row (slice / brightness / contrast). */
export const sliceRowLabelSx = {
    fontSize: '0.68rem',
    color: palette.sceneTextMuted,
    width: '16px',
    flexShrink: 0,
}

/** Right value-readout cell of a SlicePanel control row. */
export const sliceRowValueSx = {
    fontSize: '0.68rem',
    color: palette.sceneTextMuted,
    width: '24px',
    textAlign: 'right',
    flexShrink: 0,
} as const
