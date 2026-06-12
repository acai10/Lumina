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
    { label: 1, name: 'Gewebe', hex: '#ff5252', rgb: [255, 82, 82] },
    { label: 2, name: 'Hintergrund', hex: '#448aff', rgb: [68, 138, 255] },
    { label: 3, name: 'Struktur', hex: '#69f0ae', rgb: [105, 240, 174] },
    { label: 4, name: 'Marker', hex: '#ffd740', rgb: [255, 215, 64] },
]

/** Look up a palette entry by label, falling back to the first colour. */
export function colorForLabel(label: number): AnnotationColor {
    return ANNOTATION_PALETTE.find((c) => c.label === label) ?? ANNOTATION_PALETTE[0]
}

/** Opacity of the annotation tint over the slice / the 3D voxel highlight points. */
export const ANNOTATION_TINT_ALPHA = 0.45
