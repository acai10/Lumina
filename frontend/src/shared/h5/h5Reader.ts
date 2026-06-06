import { ready, File as H5File } from 'h5wasm'
import type { H5VolumeData } from '../types/viewer.types'
import { normalizeVolume } from './h5Normalizer'

export const VOLUME_DIMS: [number, number, number] = [512, 250, 250]
export const PRE_FILTER_THRESHOLD = 0.05

// Fixed H5 dataset name — the backend writes the OCT volume under this key, no guessing.
const H5_DATASET_NAME = 'OCT'

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

            const ds = f.get(H5_DATASET_NAME) as { value?: unknown } | null
            if (!ds || ds.value == null) {
                throw new Error(`Dataset "${H5_DATASET_NAME}" not found in "${file.name}"`)
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
                throw new Error(`Unsupported data type in "${H5_DATASET_NAME}" dataset`)
            }

            if (data.length !== expected) {
                throw new Error(
                    `Expected ${expected} values (${nSlices}×${height}×${width}), got ${data.length}`,
                )
            }

            return normalizeVolume(data, [nSlices, height, width], PRE_FILTER_THRESHOLD)
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

/** Reply shape posted back by h5.worker — discriminated on `ok`. */
export type WorkerResponse = { ok: true; result: H5VolumeData } | { ok: false; error: string }

export function loadH5FileInWorker(
    file: File,
    dims: [number, number, number] = VOLUME_DIMS,
): Promise<H5VolumeData> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./h5.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
            worker.terminate()
            if (e.data.ok) resolve(e.data.result)
            else reject(new Error(e.data.error))
        }
        worker.onerror = (err) => {
            worker.terminate()
            reject(new Error(err.message))
        }
        worker.postMessage({ file, dims })
    })
}
