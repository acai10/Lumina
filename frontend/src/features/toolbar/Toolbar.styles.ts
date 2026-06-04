import { styled } from '@mui/material/styles'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'
import { glowSx } from '../../app/App.styles'

export const ToolbarRoot = styled(Stack)({
    flexShrink: 0,
    background: palette.toolbarBg,
    backdropFilter: 'blur(10px)',
    borderBottom: `1px solid ${palette.toolbarBorder}`,
    padding: '8px 24px',
    overflowX: 'auto',
    flexWrap: 'nowrap',
    '&::-webkit-scrollbar': { height: 4 },
    '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.15)', borderRadius: 2 },
})

export const FileNameText = styled(Typography)({
    marginLeft: 'auto',
    color: palette.textMuted,
    fontSize: '0.8rem',
    letterSpacing: '0.04em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 320,
})

export const stlButtonSx = { ...glowSx, borderColor: palette.cyanBorder, color: palette.cyanLabel }
export const h5ButtonSx = { ...glowSx, borderColor: palette.tealBorder, color: palette.tealLabel }
export const stitchButtonSx = {
    ...glowSx,
    borderColor: 'rgba(200,150,255,0.4)',
    color: 'rgba(220,180,255,0.85)',
    '&:hover': { boxShadow: '0 0 18px 3px rgba(180,100,255,0.3)' },
}
export const clearButtonSx = {
    px: 3,
    py: 0.75,
    borderColor: palette.clearBorder,
    color: palette.clearLabel,
    '&:hover': { boxShadow: `0 0 18px 3px ${palette.clearGlow}` },
}

export const menuPaperSx = {
    background: palette.toolbarBg,
    border: `1px solid ${palette.tealBorder}`,
    backdropFilter: 'blur(10px)',
}

export const menuItemSx = { fontSize: '0.85rem', color: palette.tealLabel }

export const LoadingText = styled(Typography)({
    color: palette.textSecondary,
    fontSize: '0.85rem',
})

export const loadingSpinnerSx = { color: palette.cyan }
