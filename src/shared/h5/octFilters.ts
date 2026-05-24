import type { FilterParams } from '../types/viewer.types'

export function applyGaussianFilter(
    slice: Float32Array,
    width: number,
    height: number,
    sigma: number,
): Float32Array {
    const radius = Math.ceil(3 * sigma)
    const kernelSize = 2 * radius + 1
    const kernel = new Float32Array(kernelSize)
    let sum = 0
    for (let i = 0; i < kernelSize; i++) {
        const x = i - radius
        kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
        sum += kernel[i]
    }
    for (let i = 0; i < kernelSize; i++) kernel[i] /= sum

    const tmp = new Float32Array(width * height)

    // Horizontal pass
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            let v = 0
            for (let k = 0; k < kernelSize; k++) {
                const cc = Math.min(Math.max(c + k - radius, 0), width - 1)
                v += kernel[k] * slice[r * width + cc]
            }
            tmp[r * width + c] = v
        }
    }

    // Vertical pass
    const out = new Float32Array(width * height)
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            let v = 0
            for (let k = 0; k < kernelSize; k++) {
                const rr = Math.min(Math.max(r + k - radius, 0), height - 1)
                v += kernel[k] * tmp[rr * width + c]
            }
            out[r * width + c] = v
        }
    }
    return out
}

// Hard-coded 9-element sorting network (Batcher) for 3×3 median
function median9(a: Float32Array): number {
    // 19-compare Batcher odd-even network for 9 elements
    const s = (i: number, j: number) => {
        if (a[i] > a[j]) { const t = a[i]; a[i] = a[j]; a[j] = t }
    }
    s(0,1); s(3,4); s(6,7); s(1,2); s(4,5); s(7,8)
    s(0,1); s(3,4); s(6,7); s(0,3); s(3,6); s(0,3)
    s(1,4); s(4,7); s(1,4); s(2,5); s(5,8); s(2,5)
    s(1,3); s(5,7); s(2,6); s(4,6); s(2,4); s(2,3)
    s(5,6); s(4,5); s(3,4)
    return a[4]
}

export function applyMedianFilter(
    slice: Float32Array,
    width: number,
    height: number,
    kernelRadius: number,
): Float32Array {
    const out = new Float32Array(width * height)
    const kSize = 2 * kernelRadius + 1
    const useNet = kernelRadius === 1
    const buf = useNet ? new Float32Array(9) : new Array<number>(kSize * kSize)

    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            let idx = 0
            for (let dr = -kernelRadius; dr <= kernelRadius; dr++) {
                for (let dc = -kernelRadius; dc <= kernelRadius; dc++) {
                    const rr = Math.min(Math.max(r + dr, 0), height - 1)
                    const cc = Math.min(Math.max(c + dc, 0), width - 1)
                    buf[idx++] = slice[rr * width + cc]
                }
            }
            if (useNet) {
                out[r * width + c] = median9(buf as Float32Array)
            } else {
                ;(buf as number[]).sort((a, b) => a - b)
                out[r * width + c] = (buf as number[])[(kSize * kSize) >> 1]
            }
        }
    }
    return out
}

export function applyFilter(
    slice: Float32Array,
    width: number,
    height: number,
    params: FilterParams,
): Float32Array {
    switch (params.type) {
        case 'gaussian':
            return applyGaussianFilter(slice, width, height, params.sigma)
        case 'median':
            return applyMedianFilter(slice, width, height, params.kernelRadius)
        default:
            return slice
    }
}
