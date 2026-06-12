/** Default lateral/axial voxel size in µm/px (250 px = 1 mm grid → 4 µm/px). */
export const DEFAULT_VOXEL_SIZE_UM: [number, number, number] = [4, 4, 4]

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
