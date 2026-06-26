/**
 * Default voxel size in µm/px as **[dz, dy, dx]** (axial first) — the order every
 * consumer destructures (`const [dz, dy, dx] = voxelSizeUm`) and the order of the
 * dz/dy/dx inputs in ControlsPanel.
 * Axial (dz): 5.19 µm/px ("Pixelabstand in Luft").
 * Lateral (dy, dx): 5 mm FOV / 250 px = 20 µm/px (calibrated from the Circle
 * phantom's robot steps vs. tile overlap, cross-checked against the 14 mm CAD STL).
 */
export const DEFAULT_VOXEL_SIZE_UM: [number, number, number] = [5.19, 20, 20]

/** Micrometres per millimetre — used for µm→mm unit display. */
export const UM_PER_MM = 1000

/** Maximum value of an 8-bit channel — normalisation/quantisation scale factor. */
export const UINT8_MAX = 255

/**
 * Default normalised colormap window `[min, max]`. A shared module-level constant
 * so `?? DEFAULT_COLORMAP_RANGE` fallbacks keep a stable reference across renders
 * (preserving Zustand `useShallow` snapshot equality).
 */
export const DEFAULT_COLORMAP_RANGE: [number, number] = [0, 1]
