import type { CropBox, H5Meta } from '../../shared/types/viewer.types'
import { UINT8_MAX, UM_PER_MM } from '../../shared/constants'

export interface CropObject {
    /** Number of voxels in the connected component. */
    voxels: number
    /** Physical volume in mm³ (voxels × voxel volume). */
    volumeMm3: number
}

export interface CropObjectResult {
    count: number
    /** Components sorted by descending voxel count. */
    objects: CropObject[]
    /** True if the region exceeded MAX_ANALYSIS_VOXELS and was not processed. */
    tooLarge: boolean
    /** Voxels in the region (for the too-large message). */
    regionVoxels: number
}

/** Max region voxels labelled on the main thread before refusing (keeps the UI responsive). */
export const MAX_ANALYSIS_VOXELS = 12_000_000
/** Components below this size are treated as speckle noise and dropped. */
export const MIN_OBJECT_VOXELS = 4

/**
 * Count distinct connected structures inside the crop box at a threshold, using
 * 6-connectivity flood fill over the already-loaded normalised volume (0–255).
 * Runs on the same data the Signal readout samples, so thresholds stay consistent.
 * Returns each component's voxel count and physical volume (mm³), sorted largest
 * first. Speckle below MIN_OBJECT_VOXELS is ignored.
 */
export function analyzeRegionObjects(
    normalizedVolume: Uint8Array,
    meta: H5Meta,
    box: CropBox,
    threshold: number,
    voxelSizeUm: [number, number, number],
): CropObjectResult {
    const { x, y, z, w, h, d } = box
    const regionVoxels = w * h * d
    if (regionVoxels > MAX_ANALYSIS_VOXELS) {
        return { count: 0, objects: [], tooLarge: true, regionVoxels }
    }

    const thr = Math.round(threshold * UINT8_MAX)
    const width = meta.width
    const sliceStride = meta.height * meta.width
    const wh = w * h

    const [dz, dy, dx] = voxelSizeUm
    const voxMm3 = (dz * dy * dx) / UM_PER_MM ** 3

    // Local→global index of the box origin; local axis steps map to fixed global offsets.
    const originGlobal = z * sliceStride + y * width + x

    const visited = new Uint8Array(regionVoxels)
    const stack: number[] = []
    const objects: CropObject[] = []

    for (let seed = 0; seed < regionVoxels; seed++) {
        if (visited[seed]) continue
        const lx0 = seed % w
        const ly0 = ((seed / w) | 0) % h
        const lz0 = (seed / wh) | 0
        if (normalizedVolume[originGlobal + lz0 * sliceStride + ly0 * width + lx0] < thr) {
            visited[seed] = 1
            continue
        }

        let count = 0
        stack.length = 0
        stack.push(seed)
        visited[seed] = 1
        while (stack.length) {
            const ci = stack.pop() as number
            const lx = ci % w
            const ly = ((ci / w) | 0) % h
            const lz = (ci / wh) | 0
            const g = originGlobal + lz * sliceStride + ly * width + lx
            count++
            if (lx > 0 && !visited[ci - 1] && normalizedVolume[g - 1] >= thr) {
                visited[ci - 1] = 1
                stack.push(ci - 1)
            }
            if (lx < w - 1 && !visited[ci + 1] && normalizedVolume[g + 1] >= thr) {
                visited[ci + 1] = 1
                stack.push(ci + 1)
            }
            if (ly > 0 && !visited[ci - w] && normalizedVolume[g - width] >= thr) {
                visited[ci - w] = 1
                stack.push(ci - w)
            }
            if (ly < h - 1 && !visited[ci + w] && normalizedVolume[g + width] >= thr) {
                visited[ci + w] = 1
                stack.push(ci + w)
            }
            if (lz > 0 && !visited[ci - wh] && normalizedVolume[g - sliceStride] >= thr) {
                visited[ci - wh] = 1
                stack.push(ci - wh)
            }
            if (lz < d - 1 && !visited[ci + wh] && normalizedVolume[g + sliceStride] >= thr) {
                visited[ci + wh] = 1
                stack.push(ci + wh)
            }
        }

        if (count >= MIN_OBJECT_VOXELS) {
            objects.push({ voxels: count, volumeMm3: count * voxMm3 })
        }
    }

    objects.sort((a, b) => b.voxels - a.voxels)
    return { count: objects.length, objects, tooLarge: false, regionVoxels }
}
