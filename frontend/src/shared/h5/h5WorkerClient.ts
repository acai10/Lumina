import { VOLUME_DIMS } from './h5Constants'
import type { H5VolumeData } from '../types/viewer.types'

/**
 * Main-thread entry point for decoding an `.h5` file. This module does NOT
 * statically import `h5wasm` — it only spawns the Web Worker (`h5.worker.ts`),
 * which bundles h5wasm separately. Keeping the import out of the main graph
 * stops Vite from shipping a duplicate ~4.4 MB h5wasm chunk to every page.
 */

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
