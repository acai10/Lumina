/**
 * Fixed colour-label palette for annotations (brush / colouring). The mask stores a
 * 1-based label index per voxel; this maps each label to a display colour used both
 * in the 2D slice overlay (canvas) and the 3D voxel overlay (Three.js).
 */
export interface AnnotationColor {
    /** 1-based label id stored in the mask. */
    label: number
    /** Human-readable name shown in the toolbar tooltip. */
    name: string
    /** CSS hex for swatches and the 2D canvas overlay. */
    hex: string
    /** RGB 0–255 for canvas blending. */
    rgb: [number, number, number]
}

export const ANNOTATION_PALETTE: AnnotationColor[] = [
    { label: 1, name: 'Tissue', hex: '#ff5252', rgb: [255, 82, 82] },
    { label: 2, name: 'Background', hex: '#448aff', rgb: [68, 138, 255] },
    { label: 3, name: 'Structure', hex: '#69f0ae', rgb: [105, 240, 174] },
    { label: 4, name: 'Marker', hex: '#ffd740', rgb: [255, 215, 64] },
]

/** Opacity of the annotation tint over the slice / the 3D voxel highlight points. */
export const ANNOTATION_TINT_ALPHA = 0.45

/** Highest label value in the palette (the palette is static). */
export const ANNOTATION_MAX_LABEL = Math.max(...ANNOTATION_PALETTE.map((c) => c.label))

/**
 * Flat `label → [r,g,b]` lookup table indexed by `label*3`, covering labels
 * `0..ANNOTATION_MAX_LABEL` (label 0 = unannotated, left as zeroes). Shared by the
 * 2D slice overlay (uint8 0–255) and the 3D voxel overlay (float 0–1).
 *
 * @param scale divides each channel — `1` for 0–255 (canvas), `255` for 0–1 (GL).
 */
export function buildLabelLut(scale: 1 | 255 = 1): Float32Array {
    const t = new Float32Array((ANNOTATION_MAX_LABEL + 1) * 3)
    for (const c of ANNOTATION_PALETTE) {
        t[c.label * 3] = c.rgb[0] / scale
        t[c.label * 3 + 1] = c.rgb[1] / scale
        t[c.label * 3 + 2] = c.rgb[2] / scale
    }
    return t
}
