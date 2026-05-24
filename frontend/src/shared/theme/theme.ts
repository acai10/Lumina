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
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    borderRadius: '6px',
                    letterSpacing: '0.06em',
                    fontSize: '0.9rem',
                    transition: 'box-shadow 0.2s',
                },
            },
        },
    },
})
