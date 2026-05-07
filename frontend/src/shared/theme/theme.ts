// NEW: MUI theme config extracted from main.tsx — single source of truth for theme setup
import { createTheme } from '@mui/material'
import { palette } from './palette'

export const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: palette.bgDeep,
            paper: palette.bgPaper,
        },
    },
})
