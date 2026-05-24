export const RENDER_CONTROL_LIMITS = {
    stlOpacity: { min: 0, max: 1, step: 0.01 },
    volumeSpacing: { min: 1, max: 512, step: 1 },
    h5Threshold: { min: 0.05, max: 1, step: 0.01 },
    h5Opacity: { min: 0, max: 1, step: 0.01 },
    h5Brightness: { min: 0, max: 10, step: 0.1 },
    h5Contrast: { min: 0, max: 1, step: 0.01 },
    h5PointSize: { min: 1, max: 6, step: 0.5 },
    h5SliceRange: { min: 0, max: 512, step: 1 },
    h5WidthRange: { min: 0, max: 250, step: 1 },
    h5HeightRange: { min: 0, max: 250, step: 1 },
    filterGaussianSigma: { min: 0.5, max: 5.0, step: 0.1 },
    filterMedianRadius: { min: 1, max: 3, step: 1 },
} as const
