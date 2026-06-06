import { palette } from '../../shared/theme/palette'

const GRID_INPUT_WIDTH_PX = 68

export const gridTextFieldSx = {
    width: GRID_INPUT_WIDTH_PX,
    '& .MuiInputBase-input': {
        color: palette.textPrimary,
        fontSize: '0.78rem',
    },
    '& .MuiInputLabel-root': {
        color: palette.textMuted,
        fontSize: '0.72rem',
    },
}

/** Accent outline used by the "Add Files / Folder / Server" buttons. */
export const tealOutlineButtonSx = { borderColor: palette.borderGlass, color: palette.secondary }

/** Small muted caption above an input group (volume list, method selector). */
export const subLabelSx = { color: palette.textMuted, mb: 0.5, display: 'block' }

/** Section header above the results tables. */
export const sectionHeaderSx = {
    color: palette.textSecondary,
    letterSpacing: '0.06em',
    mb: 0.75,
    display: 'block',
}

export const metricKeyCellSx = {
    color: palette.textMuted,
    fontSize: '0.75rem',
    border: 'none',
    py: 0.25,
    px: 0,
} as const

export const metricValueCellSx = {
    color: palette.textPrimary,
    fontSize: '0.75rem',
    border: 'none',
    py: 0.25,
    textAlign: 'right',
} as const

export const offsetKeyCellSx = {
    color: palette.textMuted,
    fontSize: '0.72rem',
    border: 'none',
    py: 0.25,
    px: 0,
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
} as const

export const offsetValueCellSx = {
    color: palette.textPrimary,
    fontSize: '0.72rem',
    border: 'none',
    py: 0.25,
    textAlign: 'right',
} as const
