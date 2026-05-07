// NEW: glowSx extracted from App.tsx — 7 props + hover pseudo-selector justifies extraction
import { palette } from '../shared/theme/palette'

export const glowSx = {
    px: 3,
    py: 0.75,
    fontSize: '0.9rem',
    letterSpacing: '0.06em',
    borderRadius: '6px',
    textTransform: 'none' as const,
    transition: 'box-shadow 0.2s',
    '&:hover': { boxShadow: `0 0 18px 3px ${palette.cyanGlow}` },
}
