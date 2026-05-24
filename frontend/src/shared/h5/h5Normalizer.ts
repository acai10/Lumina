import type { H5VolumeData } from '../types/viewer.types'

export function normalizeVolume(
    raw: Float32Array,
    dims: [number, number, number],
    threshold: number,
): H5VolumeData {
    const [nSlices, height, width] = dims
    const sliceSize = height * width
    const total = nSlices * sliceSize
    const tmpIndices = new Float32Array(total)
    const tmpIntensities = new Float32Array(total)
    const normalizedVolume = new Float32Array(total)
    let count = 0

    for (let s = 0; s < nSlices; s++) {
        const offset = s * sliceSize
        let min = Infinity,
            max = -Infinity
        for (let i = 0; i < sliceSize; i++) {
            const v = raw[offset + i]
            if (v < min) min = v
            if (v > max) max = v
        }
        const range = max > min ? max - min : 1
        for (let i = 0; i < sliceSize; i++) {
            const normalized = (raw[offset + i] - min) / range
            normalizedVolume[offset + i] = normalized
            if (normalized >= threshold) {
                tmpIndices[count] = offset + i
                tmpIntensities[count] = normalized
                count++
            }
        }
    }

    // Sort by intensity descending (2-pass radix sort, O(n)) so setDrawRange(0, N) gives the N
    // brightest points. Using Uint32Array avoids the GC overhead of a regular JS Array.
    const BITS = 12
    const BUCKETS = 1 << BITS // 4096 per pass
    const MASK = BUCKETS - 1

    // 24-bit sort key: invert so that higher intensity → smaller key → sorted first
    const sortKeys = new Uint32Array(count)
    for (let i = 0; i < count; i++) {
        sortKeys[i] = ~Math.round(tmpIntensities[i] * 0xffffff) & 0xffffff
    }

    const perm = new Uint32Array(count)
    for (let i = 0; i < count; i++) perm[i] = i
    const tempPerm = new Uint32Array(count)
    const hist = new Uint32Array(BUCKETS)

    // Pass 1: sort by bits 0–11
    for (let i = 0; i < count; i++) hist[sortKeys[i] & MASK]++
    for (let i = 1; i < BUCKETS; i++) hist[i] += hist[i - 1]
    for (let i = count - 1; i >= 0; i--) tempPerm[--hist[sortKeys[perm[i]] & MASK]] = perm[i]

    // Pass 2: sort by bits 12–23
    hist.fill(0)
    for (let i = 0; i < count; i++) hist[(sortKeys[tempPerm[i]] >> BITS) & MASK]++
    for (let i = 1; i < BUCKETS; i++) hist[i] += hist[i - 1]
    for (let i = count - 1; i >= 0; i--)
        perm[--hist[(sortKeys[tempPerm[i]] >> BITS) & MASK]] = tempPerm[i]

    const vIndices = new Float32Array(count)
    const vIntensities = new Float32Array(count)
    for (let i = 0; i < count; i++) {
        vIndices[i] = tmpIndices[perm[i]]
        vIntensities[i] = tmpIntensities[perm[i]]
    }

    return { nSlices, height, width, vIndices, vIntensities, normalizedVolume }
}
