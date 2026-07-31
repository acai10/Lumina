import type { H5VolumeData } from '../types/viewer.types'
import { UINT8_MAX } from '../constants'

/** 24-bit quantisation range for the intensity radix-sort key (2 × 12-bit passes). */
const INTENSITY_SORT_QUANT = 0xffffff

export function normalizeVolume(
    raw: Float32Array,
    dims: [number, number, number],
    threshold: number,
): H5VolumeData {
    const [nSlices, height, width] = dims
    const sliceSize = height * width
    const total = nSlices * sliceSize

    // Pass 1 — per-slice min/max and exact above-threshold count.
    // Keeping min/max in small typed arrays avoids a third pass over raw.
    const sliceMin = new Float32Array(nSlices)
    const sliceMax = new Float32Array(nSlices)

    for (let s = 0; s < nSlices; s++) {
        const offset = s * sliceSize
        let mn = Infinity,
            mx = -Infinity
        for (let i = 0; i < sliceSize; i++) {
            const v = raw[offset + i]
            if (v < mn) mn = v
            if (v > mx) mx = v
        }
        sliceMin[s] = mn
        sliceMax[s] = mx
    }

    let count = 0
    for (let s = 0; s < nSlices; s++) {
        const offset = s * sliceSize
        const mn = sliceMin[s]
        const range = sliceMax[s] > mn ? sliceMax[s] - mn : 1
        for (let i = 0; i < sliceSize; i++) {
            if ((raw[offset + i] - mn) / range >= threshold) count++
        }
    }

    // Pass 2 — fill exact-sized buffers.
    // normalizedVolume uses Uint8Array (0-255) instead of Float32Array to cut
    // memory 4× — crucial for large merged volumes (64 MB vs 256 MB).
    const normalizedVolume = new Uint8Array(total)
    // Uint32: a full volume's flat index reaches 32M, past float32's exact-integer
    // range (2^24), which would misplace deep voxels in the 3D cloud.
    const tmpIndices = new Uint32Array(count)
    const tmpIntensities = new Float32Array(count)
    let idx = 0

    for (let s = 0; s < nSlices; s++) {
        const offset = s * sliceSize
        const mn = sliceMin[s]
        const range = sliceMax[s] > mn ? sliceMax[s] - mn : 1
        for (let i = 0; i < sliceSize; i++) {
            const normalized = (raw[offset + i] - mn) / range
            normalizedVolume[offset + i] = Math.round(normalized * UINT8_MAX)
            if (normalized >= threshold) {
                tmpIndices[idx] = offset + i
                tmpIntensities[idx] = normalized
                idx++
            }
        }
    }

    // Radix sort by intensity descending — O(n), two 12-bit passes (LSD radix
    // over a 24-bit key: pass 1 sorts by the low 12 bits, pass 2 by the high 12,
    // and the sort's stability makes the combined order correct).
    const BITS = 12
    const BUCKETS = 1 << BITS
    const MASK = BUCKETS - 1

    // Key = bitwise complement of the quantised intensity: radix sort is
    // ascending, so sorting the complement yields intensities in DESCENDING
    // order without a separate reverse pass.
    const sortKeys = new Uint32Array(count)
    for (let i = 0; i < count; i++) {
        sortKeys[i] = ~Math.round(tmpIntensities[i] * INTENSITY_SORT_QUANT) & INTENSITY_SORT_QUANT
    }

    const perm = new Uint32Array(count)
    for (let i = 0; i < count; i++) perm[i] = i
    const tempPerm = new Uint32Array(count)
    const hist = new Uint32Array(BUCKETS)

    for (let i = 0; i < count; i++) hist[sortKeys[i] & MASK]++
    for (let i = 1; i < BUCKETS; i++) hist[i] += hist[i - 1]
    for (let i = count - 1; i >= 0; i--) tempPerm[--hist[sortKeys[perm[i]] & MASK]] = perm[i]

    hist.fill(0)
    for (let i = 0; i < count; i++) hist[(sortKeys[tempPerm[i]] >> BITS) & MASK]++
    for (let i = 1; i < BUCKETS; i++) hist[i] += hist[i - 1]
    for (let i = count - 1; i >= 0; i--)
        perm[--hist[(sortKeys[tempPerm[i]] >> BITS) & MASK]] = tempPerm[i]

    const vIndices = new Uint32Array(count)
    const vIntensities = new Float32Array(count)
    for (let i = 0; i < count; i++) {
        vIndices[i] = tmpIndices[perm[i]]
        vIntensities[i] = tmpIntensities[perm[i]]
    }

    return { nSlices, height, width, vIndices, vIntensities, normalizedVolume }
}
