import { palette } from '../shared/theme/palette'

/** Shared padding + soft Aero hover lift for toolbar buttons. */
export const glowSx = {
    px: 3,
    py: 0.75,
    '&:hover': { boxShadow: `0 2px 12px ${palette.primarySoft}` },
}
