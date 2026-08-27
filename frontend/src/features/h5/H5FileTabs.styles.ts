/** Tab-bar styles: the styled Tabs container plus the drag and STL-tint variants. */
import { styled } from '@mui/material/styles'
import Tabs from '@mui/material/Tabs'
import { palette } from '../../shared/theme/palette'

export const H5Tabs = styled(Tabs)({
    flexShrink: 0,
    background: palette.surfaceGlass,
    backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${palette.borderGlass}`,
    minHeight: 36,
    '& .MuiTab-root': {
        minHeight: 36,
        fontSize: '0.75rem',
        color: palette.textMuted,
        textTransform: 'none',
        letterSpacing: '0.02em',
    },
    '& .MuiTab-root.Mui-selected': { color: palette.primaryDeep },
    '& .MuiTabs-indicator': { backgroundColor: palette.primary },
})

export const closeIconButtonSx = {
    p: 0.1,
    ml: 0.5,
    color: 'inherit',
    opacity: 0.6,
    '&:hover': { opacity: 1 },
}

export const dragTabSx = { cursor: 'grab' }

// STL tabs are tinted teal to distinguish them from H5 tabs; selected state deepens.
export const stlTabSx = {
    cursor: 'grab',
    color: palette.secondary,
    '&.Mui-selected': { color: palette.secondary, fontWeight: 600 },
}
