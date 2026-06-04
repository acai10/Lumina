import { VOLUME_DIMS, PRE_FILTER_THRESHOLD } from '../../shared/h5/h5Reader'

const [N_SLICES, HEIGHT, WIDTH] = VOLUME_DIMS

export const RENDER_CONTROL_LIMITS = {
    stlOpacity: { min: 0, max: 1, step: 0.01 },
    volumeSpacing: { min: 1, max: N_SLICES, step: 1 },
    h5Threshold: { min: PRE_FILTER_THRESHOLD, max: 1, step: 0.01 },
    h5Opacity: { min: 0, max: 1, step: 0.01 },
    h5Brightness: { min: 0, max: 10, step: 0.1 },
    // Contrast is the tone-map exponent (1 = neutral). Values > 1 increase
    // contrast, < 1 flatten it, so the range must extend above 1 to be useful.
    h5Contrast: { min: 0, max: 3, step: 0.05 },
    h5PointSize: { min: 1, max: 6, step: 0.5 },
    h5SliceRange: { min: 0, max: N_SLICES, step: 1 },
    h5WidthRange: { min: 0, max: WIDTH, step: 1 },
    h5HeightRange: { min: 0, max: HEIGHT, step: 1 },
    filterGaussianSigma: { min: 0.5, max: 5.0, step: 0.1 },
    // Passed straight to ndi.median_filter(size=…). Sizes must be odd to keep a
    // symmetric footprint; 1 would be a no-op, 2 an asymmetric (shifted) window.
    filterMedianRadius: { min: 3, max: 7, step: 2 },
    filterLeeWindow: { min: 3, max: 9, step: 2 },
    filterBm3dSigma: { min: 0.05, max: 0.5, step: 0.05 },
    filterNormalizeLow: { min: 0, max: 10, step: 0.5 },
    filterNormalizeHigh: { min: 90, max: 100, step: 0.5 },
} as const

export function getRenderControlLimits(meta?: { nSlices: number; height: number; width: number }) {
    const nSlices = meta?.nSlices ?? N_SLICES
    const height = meta?.height ?? HEIGHT
    const width = meta?.width ?? WIDTH
    return {
        ...RENDER_CONTROL_LIMITS,
        h5SliceRange: { min: 0, max: nSlices, step: 1 },
        h5WidthRange: { min: 0, max: width, step: 1 },
        h5HeightRange: { min: 0, max: height, step: 1 },
    }
}
