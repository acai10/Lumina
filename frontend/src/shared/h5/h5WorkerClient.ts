// Main-thread client for h5.worker — must stay h5wasm-free (see h5Constants.ts).
import type { H5VolumeData } from '../types/viewer.types'
import { VOLUME_DIMS } from './h5Constants'

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
