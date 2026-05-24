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
            if (normalized >= threshold) {
                tmpIndices[count] = offset + i
                tmpIntensities[count] = normalized
                count++
            }
        }
    }

    return {
        nSlices,
        height,
        width,
        vIndices: tmpIndices.slice(0, count),
        vIntensities: tmpIntensities.slice(0, count),
    }
}
