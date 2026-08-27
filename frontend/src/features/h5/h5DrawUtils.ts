import * as THREE from 'three'

/**
 * Draw-range helpers over the intensity-sorted point cloud.
 *
 * Because the voxels are uploaded sorted by intensity, "show everything above this
 * threshold" is a prefix of the buffer, so a binary search turns the threshold slider
 * into a draw-range change instead of a re-upload.
 */
// vIntensities is sorted descending; returns count of elements >= threshold
export function countAboveThreshold(arr: Float32Array, threshold: number): number {
    let lo = 0,
        hi = arr.length
    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (arr[mid] >= threshold) lo = mid + 1
        else hi = mid
    }
    return lo
}

export function applyDrawRanges(
    geos: THREE.BufferGeometry[],
    vIntensities: Float32Array,
    threshold: number,
) {
    const total = countAboveThreshold(vIntensities, threshold)
    let remaining = total
    for (const geo of geos) {
        const rawAttr = geo.getAttribute('vIntensity')
        const attr = rawAttr instanceof THREE.BufferAttribute ? rawAttr : null
        if (!attr) continue
        const chunkSize = attr.count
        const draw = Math.min(chunkSize, remaining)
        geo.setDrawRange(0, draw)
        remaining = Math.max(0, remaining - draw)
    }
}
