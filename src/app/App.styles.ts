import { palette } from '../shared/theme/palette'

export const glowSx = {
    px: 3,
    py: 0.75,
    '&:hover': { boxShadow: `0 0 18px 3px ${palette.cyanGlow}` },
}
