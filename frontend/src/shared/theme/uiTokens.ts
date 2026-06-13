import { palette } from './palette'

/**
 * Shared UI primitives applied across the control panels, file list and stitcher
 * so spacing, header style and label sizing stay consistent app-wide.
 */

/** Uppercase eyebrow / section header above a control group or docked panel. */
export const eyebrowSx = {
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: palette.textSecondary,
    userSelect: 'none' as const,
}

/** The single allowed sub-caption size (kept ≥ 10px for legibility). */
export const microLabelSx = {
    fontSize: '0.625rem',
    color: palette.textSecondary,
    letterSpacing: '0.03em',
    userSelect: 'none' as const,
}

/** Compact action button — uniform font + vertical padding for every small button. */
export const compactButtonSx = { fontSize: '0.65rem', py: 0.4 } as const
