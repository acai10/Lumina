import { createTheme } from '@mui/material/styles'
import { palette } from './palette'

// Segoe UI leads the stack — the Windows Vista system font, on-theme for the
// "Aero glass / medical" identity and requiring no bundled web font.
const FONT_STACK = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const medicalTheme = createTheme({
    palette: {
        mode: 'light',
        background: {
            default: palette.bgApp,
            paper: palette.surfaceSolid,
        },
        primary: { main: palette.primary, dark: palette.primaryDeep },
        secondary: { main: palette.secondary },
        error: { main: palette.danger },
        text: {
            primary: palette.textPrimary,
            secondary: palette.textSecondary,
        },
    },
    shape: { borderRadius: 8 },
    typography: {
        fontFamily: FONT_STACK,
        // Single source of truth for sizes — components stop hand-picking rem values.
        body1: { fontSize: '0.875rem' },
        body2: { fontSize: '0.8125rem' }, // controls / sliders (13px)
        caption: { fontSize: '0.75rem' }, // labels (12px floor — readable)
        subtitle2: { fontSize: '0.8125rem', fontWeight: 600, letterSpacing: '0.04em' },
        h6: { fontSize: '1rem', fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                // Soft Aero gradient behind the whole app.
                body: {
                    backgroundColor: palette.bgApp,
                    backgroundImage: palette.bgAppGradient,
                },
                // Consistent light scrollbars app-wide.
                '*::-webkit-scrollbar': { width: 10, height: 10 },
                '*::-webkit-scrollbar-thumb': {
                    background: palette.scrollbarThumb,
                    borderRadius: 5,
                    border: '2px solid transparent',
                    backgroundClip: 'padding-box',
                },
                // Visible keyboard focus everywhere (was missing).
                '*:focus-visible': {
                    outline: `2px solid ${palette.focusRing}`,
                    outlineOffset: 2,
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: ({ theme }) => ({
                    borderRadius: `${theme.shape.borderRadius * 0.5}px`,
                    letterSpacing: '0.03em',
                    fontSize: theme.typography.body2.fontSize,
                    transition: theme.transitions.create(['box-shadow', 'background'], {
                        duration: theme.transitions.duration.short,
                    }),
                    '&:focus-visible': { boxShadow: `0 0 0 3px ${palette.primarySoft}` },
                }),
                // Glossy Aero contained button.
                contained: {
                    backgroundImage: palette.primaryGradient,
                    boxShadow: `inset 0 1px 0 ${palette.glassHighlight}, ${palette.glassShadow}`,
                    '&:hover': { backgroundImage: palette.primaryGradientHover },
                },
                // Frosted-glass outlined button.
                outlined: {
                    background: palette.surfaceGlass,
                    backdropFilter: 'blur(8px)',
                    borderColor: palette.borderGlass,
                    '&:hover': {
                        borderColor: palette.borderStrong,
                        background: palette.surfaceSubtle,
                    },
                },
            },
        },
        // Frosted-glass surfaces for menus, popovers, dialogs, select dropdowns.
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                paper: {
                    background: palette.surfaceGlass,
                    backdropFilter: 'blur(12px)',
                    border: `1px solid ${palette.borderGlass}`,
                    boxShadow: palette.glassShadow,
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    background: palette.surfaceGlassStrong,
                    backdropFilter: 'blur(16px)',
                    border: `1px solid ${palette.borderGlass}`,
                },
            },
        },
        MuiSlider: {
            styleOverrides: {
                root: { color: palette.primary },
                thumb: {
                    '&:focus-visible, &.Mui-focusVisible': {
                        boxShadow: `0 0 0 6px ${palette.primarySoft}`,
                    },
                },
            },
        },
        MuiToggleButton: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    color: palette.textSecondary,
                    borderColor: palette.borderGlass,
                    '&.Mui-selected': {
                        background: palette.primarySoft,
                        color: palette.primaryDeep,
                        '&:hover': { background: palette.primarySoft },
                    },
                },
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    background: palette.surfaceGlassStrong,
                    color: palette.textPrimary,
                    border: `1px solid ${palette.borderGlass}`,
                    backdropFilter: 'blur(8px)',
                    fontSize: '0.72rem',
                },
            },
        },
    },
})
