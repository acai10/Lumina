import { ready, File as H5File } from 'h5wasm'
import type { H5VolumeData } from '../types/viewer.types'

const VOLUME_DIMS: [number, number, number] = [512, 250, 250]

function computeMinMax(data: Float32Array): [number, number] {
    let min = Infinity,
        max = -Infinity
    for (let i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i]
        if (data[i] > max) max = data[i]
    }
    return [min, max]
}

export async function loadH5File(
    file: File,
    dims: [number, number, number] = VOLUME_DIMS,
): Promise<H5VolumeData> {
    const { FS } = await ready
    const buf = await file.arrayBuffer()
    const fname = `h5_${Date.now()}_${Math.random().toString(36).slice(2)}.h5`

    FS.writeFile(fname, new Uint8Array(buf))
    try {
        const f = new H5File(fname, 'r')
        try {
            const [nSlices, height, width] = dims
            const expected = nSlices * height * width

            const ds = f.get('OCT') as { value?: unknown } | null
            if (!ds || ds.value == null) {
                throw new Error(`Dataset "OCT" not found in "${file.name}"`)
            }

            const raw = ds.value
            let data: Float32Array
            if (raw instanceof Float32Array) {
                data = raw
            } else if (raw instanceof Float64Array) {
                data = Float32Array.from(raw)
            } else if (
                raw instanceof Int32Array ||
                raw instanceof Uint32Array ||
                raw instanceof Int16Array ||
                raw instanceof Uint16Array ||
                raw instanceof Uint8Array ||
                raw instanceof Int8Array
            ) {
                data = Float32Array.from(raw as ArrayLike<number>)
            } else if (Array.isArray(raw)) {
                data = Float32Array.from(raw as number[])
            } else {
                throw new Error(`Unsupported data type in "oct" dataset`)
            }

            if (data.length !== expected) {
                throw new Error(
                    `Expected ${expected} values (${nSlices}×${height}×${width}), got ${data.length}`,
                )
            }

            const sliceSize = height * width
            const slices = Array.from(
                { length: nSlices },
                (_, i) => data.slice(i * sliceSize, (i + 1) * sliceSize) as Float32Array,
            )
            const sliceMinMax = slices.map(computeMinMax)

            return { nSlices, height, width, slices, sliceMinMax }
        } finally {
            f.close()
        }
    } finally {
        try {
            FS.unlink(fname)
        } catch {
            // ignore cleanup errors
        }
    }
}

export function loadH5FileInWorker(
    file: File,
    dims: [number, number, number] = VOLUME_DIMS,
): Promise<H5VolumeData> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./h5.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (e) => {
            worker.terminate()
            if (e.data.ok) resolve(e.data.result as H5VolumeData)
            else reject(new Error(e.data.error))
        }
        worker.onerror = (err) => {
            worker.terminate()
            reject(new Error(err.message))
        }
        worker.postMessage({ file, dims })
    })
}
