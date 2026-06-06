import { styled } from '@mui/material/styles'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'
import { glowSx } from '../../app/App.styles'

export const ToolbarRoot = styled(Stack)(({ theme }) => ({
    flexShrink: 0,
    background: palette.surfaceGlass,
    backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${palette.borderGlass}`,
    boxShadow: `inset 0 1px 0 ${palette.glassHighlight}`,
    padding: theme.spacing(1, 3),
    overflowX: 'auto',
    flexWrap: 'nowrap',
    '&::-webkit-scrollbar': { height: 6 },
    '&::-webkit-scrollbar-thumb': { background: palette.scrollbarThumb, borderRadius: 3 },
}))

export const FileNameText = styled(Typography)({
    marginLeft: 'auto',
    color: palette.textMuted,
    fontSize: '0.8rem',
    letterSpacing: '0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 320,
})

// Outlined buttons inherit the frosted-glass base from the theme; these tint the accent.
export const stlButtonSx = { ...glowSx, borderColor: palette.borderGlass, color: palette.secondary }
export const h5ButtonSx = { ...glowSx, borderColor: palette.borderGlass, color: palette.primary }
export const stitchButtonSx = {
    ...glowSx,
    borderColor: palette.borderGlass,
    color: palette.primaryDeep,
}
export const clearButtonSx = {
    px: 3,
    py: 0.75,
    borderColor: palette.dangerSoft,
    color: palette.danger,
    '&:hover': { borderColor: palette.danger, background: palette.dangerSoft },
}

export const menuPaperSx = {
    background: palette.surfaceGlass,
    border: `1px solid ${palette.borderGlass}`,
    backdropFilter: 'blur(12px)',
}

export const menuItemSx = { fontSize: '0.85rem', color: palette.textPrimary }

export const LoadingText = styled(Typography)({
    color: palette.textSecondary,
    fontSize: '0.85rem',
})

export const loadingSpinnerSx = { color: palette.primary }
