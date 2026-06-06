// Shared layout constants for the app shell. Centralized here (used in 3+ files)
// so docked panel widths / insets are tokens rather than scattered magic numbers.

/** Width of the docked controls sidebar when expanded. */
export const CONTROLS_WIDTH = 248

/** Width of the collapsed controls rail (just the expand affordance). */
export const RAIL_WIDTH = 40

/** Width of the docked stitcher panel on the right. */
export const STITCHER_WIDTH = 420

/** Corner radius for docked panels / glass cards. */
export const PANEL_RADIUS = 10

/** Inner padding (MUI spacing units) for docked panels. */
export const PANEL_PADDING = 1.75

/**
 * Left inset (px) for the slice-viewer grid so it clears the docked controls
 * sidebar plus a gutter. Kept slightly wider than CONTROLS_WIDTH (248) on purpose.
 */
export const SLICE_GRID_LEFT_INSET = 270
