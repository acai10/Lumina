import { VOLUME_DIMS } from '../../shared/h5/h5Reader'

const [N_SLICES, HEIGHT, WIDTH] = VOLUME_DIMS

export const RENDER_CONTROL_LIMITS = {
    stlOpacity: { min: 0, max: 1, step: 0.01 },
    volumeSpacing: { min: 1, max: N_SLICES, step: 1 },
    h5Threshold: { min: 0.05, max: 1, step: 0.01 },
    h5Opacity: { min: 0, max: 1, step: 0.01 },
    h5Brightness: { min: 0, max: 10, step: 0.1 },
    h5Contrast: { min: 0, max: 1, step: 0.01 },
    h5PointSize: { min: 1, max: 6, step: 0.5 },
    h5SliceRange: { min: 0, max: N_SLICES, step: 1 },
    h5WidthRange: { min: 0, max: WIDTH, step: 1 },
    h5HeightRange: { min: 0, max: HEIGHT, step: 1 },
    filterGaussianSigma: { min: 0.5, max: 5.0, step: 0.1 },
    filterMedianRadius: { min: 1, max: 3, step: 1 },
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
