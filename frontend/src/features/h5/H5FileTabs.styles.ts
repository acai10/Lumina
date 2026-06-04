import { styled } from '@mui/material/styles'
import Tabs from '@mui/material/Tabs'
import { palette } from '../../shared/theme/palette'

export const H5Tabs = styled(Tabs)({
    flexShrink: 0,
    background: palette.toolbarBg,
    borderBottom: `1px solid ${palette.toolbarBorder}`,
    minHeight: 36,
    '& .MuiTab-root': {
        minHeight: 36,
        fontSize: '0.75rem',
        color: palette.textMuted,
        textTransform: 'none',
        letterSpacing: '0.03em',
    },
    '& .MuiTab-root.Mui-selected': { color: palette.tealLabel },
    '& .MuiTabs-indicator': { backgroundColor: palette.tealBorder },
})

export const closeIconButtonSx = {
    p: 0.1,
    ml: 0.5,
    color: 'inherit',
    opacity: 0.6,
    '&:hover': { opacity: 1 },
}

export const dragTabSx = { cursor: 'grab' }

// STL tabs are tinted cyan to distinguish them from H5 tabs; selected state brightens.
export const stlTabSx = {
    cursor: 'grab',
    color: palette.cyanTabIdle,
    '&.Mui-selected': { color: palette.cyanTabSelected },
}
