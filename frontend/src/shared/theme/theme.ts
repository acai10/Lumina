import { createTheme } from '@mui/material/styles'
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
                root: ({ theme }) => ({
                    textTransform: 'none',
                    borderRadius: `${theme.shape.borderRadius * 1.5}px`,
                    letterSpacing: '0.06em',
                    fontSize: theme.typography.body2.fontSize,
                    transition: theme.transitions.create('box-shadow', {
                        duration: theme.transitions.duration.short,
                    }),
                }),
            },
        },
    },
})
