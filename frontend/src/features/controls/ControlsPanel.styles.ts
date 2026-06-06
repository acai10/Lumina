import { styled } from '@mui/material/styles'
import { palette } from '../../shared/theme/palette'
import { CONTROLS_WIDTH, RAIL_WIDTH, PANEL_PADDING } from '../../shared/theme/layout'

export const sliderSx = {
    color: palette.primary,
    py: 0,
    '& .MuiSlider-thumb': { width: '14px', height: '14px' },
    '& .MuiSlider-track': { opacity: 0.9 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

export const labelSx = {
    fontSize: '0.75rem',
    color: palette.textSecondary,
    letterSpacing: '0.03em',
    userSelect: 'none' as const,
}

/** Shared small-control font for Select / MenuItem / InputLabel slots in the panel. */
export const controlFontSx = { fontSize: '0.8125rem' }

/** Light, focus-ringed numeric input used by SliderRow / RangeSliderRow. */
export const NumberInput = styled('input')({
    width: 52,
    background: palette.surfaceSolid,
    border: `1px solid ${palette.borderGlass}`,
    color: palette.textPrimary,
    fontSize: '0.75rem',
    fontFamily: 'inherit',
    textAlign: 'right',
    borderRadius: 4,
    padding: '2px 6px',
    outline: 'none',
    transition: 'border-color 120ms, box-shadow 120ms',
    '&:hover': { borderColor: palette.borderStrong },
    '&:focus-visible': {
        borderColor: palette.primary,
        boxShadow: `0 0 0 3px ${palette.primarySoft}`,
    },
})

/** Docked controls sidebar (flex column, never overlaps the scene). */
export const panelSx = {
    flexShrink: 0,
    width: CONTROLS_WIDTH,
    height: '100%',
    overflowY: 'auto',
    background: palette.surfaceGlass,
    backdropFilter: 'blur(12px)',
    borderRight: `1px solid ${palette.borderGlass}`,
    boxShadow: `inset 0 1px 0 ${palette.glassHighlight}`,
    px: PANEL_PADDING,
    py: PANEL_PADDING,
}

/** Collapsed rail — just the expand affordance. */
export const railSx = {
    flexShrink: 0,
    width: RAIL_WIDTH,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    pt: 1,
    background: palette.surfaceGlass,
    backdropFilter: 'blur(12px)',
    borderRight: `1px solid ${palette.borderGlass}`,
}

/** Header row: title + collapse / reset actions. */
export const headerSx = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    mb: 0.5,
}

export const headerTitleSx = {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    color: palette.textMuted,
    userSelect: 'none' as const,
}

export const sliderStackSx = { width: '100%' }

export const separatorSx = {
    fontSize: '0.75rem',
    color: palette.textMuted,
    userSelect: 'none' as const,
}

export const iconButtonSx = {
    color: palette.textMuted,
    '&:hover': { color: palette.primary, background: palette.primarySoft },
}

/** Compact accordion section used to group the render controls. */
export const accordionSx = {
    background: 'transparent',
    boxShadow: 'none',
    border: 'none',
    '&:before': { display: 'none' },
    '& .MuiAccordionSummary-root': { minHeight: 32, px: 0 },
    '& .MuiAccordionSummary-content': { my: 0.5 },
    '& .MuiAccordionDetails-root': { px: 0, pt: 0.5, pb: 1 },
}

export const accordionTitleSx = {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    color: palette.textSecondary,
}
