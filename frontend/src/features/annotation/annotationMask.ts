import type { H5Meta } from '../../shared/types/viewer.types'

/**
 * Per-voxel annotation mask helpers. The mask itself (a `Uint8Array`, label per
 * voxel, 0 = unannotated) lives per-tab in the Zustand store so it travels with the
 * tab and never touches the underlying HDF5 data. This module mutates that mask in
 * place (the store bumps a version counter to notify subscribers) and maintains a
 * sparse `voxel → label` index per file so the 3D overlay can be rebuilt by iterating
 * only painted voxels instead of scanning the whole 32M-voxel volume each stroke.
 */

// fileKey → (global voxel index → label). Rebuilt lazily from the mask when missing
// (e.g. after the owning tab's buffers were evicted and restored).
const indexByFile = new Map<string, Map<number, number>>()

/** Drop a file's cached index (call when its tab closes). */
export function disposeAnnotationIndex(fileKey: string): void {
    indexByFile.delete(fileKey)
}

/** Drop every cached annotation index (call on a full store reset). */
export function disposeAllAnnotationIndices(): void {
    indexByFile.clear()
}

function ensureIndex(fileKey: string, mask: Uint8Array): Map<number, number> {
    let m = indexByFile.get(fileKey)
    if (!m) {
        m = new Map()
        for (let i = 0; i < mask.length; i++) {
            const l = mask[i]
            if (l) m.set(i, l)
        }
        indexByFile.set(fileKey, m)
    }
    return m
}

/** In-plane point to paint, in pre-orientation (orig) slice coords. */
export interface StrokePoint {
    ox: number
    oy: number
}

export interface PaintStrokeParams {
    fileKey: string
    mask: Uint8Array
    meta: H5Meta
    axis: 'z' | 'y' | 'x'
    sliceIndex: number
    points: StrokePoint[]
    radius: number
    /** Label to write; 0 erases. */
    label: number
}

/**
 * Paint (or erase, when `label === 0`) filled discs of `radius` voxels at each point
 * of a stroke into the mask, on the given slice of the given axis. Maps in-plane
 * (ox, oy) + slice index to the global voxel index using the same axis convention as
 * the slice viewer.
 */
export function paintStroke(p: PaintStrokeParams): void {
    const { fileKey, mask, meta, axis, sliceIndex, points, radius, label } = p
    const { nSlices, height, width } = meta
    const sliceStride = height * width
    const origW = axis === 'x' ? nSlices : width
    const origH = axis === 'y' ? nSlices : height
    const idx = ensureIndex(fileKey, mask)
    const r2 = radius * radius

    for (const { ox, oy } of points) {
        const x0 = Math.max(0, Math.floor(ox - radius))
        const x1 = Math.min(origW - 1, Math.ceil(ox + radius))
        const y0 = Math.max(0, Math.floor(oy - radius))
        const y1 = Math.min(origH - 1, Math.ceil(oy + radius))
        for (let yy = y0; yy <= y1; yy++) {
            const dy = yy - oy
            for (let xx = x0; xx <= x1; xx++) {
                const dx = xx - ox
                if (dx * dx + dy * dy > r2) continue
                let s: number, vh: number, vw: number
                if (axis === 'z') {
                    s = sliceIndex
                    vh = yy
                    vw = xx
                } else if (axis === 'y') {
                    s = yy
                    vh = sliceIndex
                    vw = xx
                } else {
                    s = xx
                    vh = yy
                    vw = sliceIndex
                }
                const gi = s * sliceStride + vh * width + vw
                if (label) {
                    mask[gi] = label
                    idx.set(gi, label)
                } else {
                    mask[gi] = 0
                    idx.delete(gi)
                }
            }
        }
    }
}

/** Zero the whole mask and drop the index. */
export function clearAnnotation(fileKey: string, mask: Uint8Array): void {
    mask.fill(0)
    indexByFile.delete(fileKey)
}

/** Number of annotated voxels (for UI). */
export function annotatedCount(fileKey: string, mask: Uint8Array): number {
    return ensureIndex(fileKey, mask).size
}

/** Parallel arrays of every annotated voxel's global index and label (for the 3D overlay). */
export function annotationArrays(
    fileKey: string,
    mask: Uint8Array,
): { indices: Uint32Array; labels: Uint8Array } {
    const idx = ensureIndex(fileKey, mask)
    const n = idx.size
    const indices = new Uint32Array(n)
    const labels = new Uint8Array(n)
    let i = 0
    for (const [gi, l] of idx) {
        indices[i] = gi
        labels[i] = l
        i++
    }
    return { indices, labels }
}
