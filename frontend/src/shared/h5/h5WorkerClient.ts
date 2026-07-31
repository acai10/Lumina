import { VOLUME_DIMS } from './h5Constants'
import type { H5VolumeData } from '../types/viewer.types'

/**
 * Main-thread entry point for decoding an `.h5` file. This module does NOT
 * statically import `h5wasm` — it only spawns the Web Worker (`h5.worker.ts`),
 * which bundles h5wasm separately. Keeping the import out of the main graph
 * stops Vite from shipping a duplicate ~4.4 MB h5wasm chunk to every page.
 *
 * A single worker is reused across all files: spinning up a fresh worker per
 * file re-fetched and re-compiled the ~4.4 MB h5wasm module every time, which
 * dominated folder-load time. Requests carry an id so one long-lived worker can
 * multiplex them.
 */

export interface WorkerRequest {
    id: number
    file: File
    dims: [number, number, number]
}

/** Reply shape posted back by h5.worker — discriminated on `ok`, keyed by `id`. */
export type WorkerResponse = { id: number } & (
    | { ok: true; result: H5VolumeData }
    | { ok: false; error: string }
)

let worker: Worker | null = null
let nextId = 0
const pending = new Map<
    number,
    { resolve: (d: H5VolumeData) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
    if (worker) return worker
    const w = new Worker(new URL('./h5.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const entry = pending.get(e.data.id)
        if (!entry) return
        pending.delete(e.data.id)
        if (e.data.ok) entry.resolve(e.data.result)
        else entry.reject(new Error(e.data.error))
    }
    const failAll = (error: Error) => {
        // A worker-level crash fails every outstanding request and forces a fresh
        // worker on the next call (the old one may be in a bad state).
        for (const { reject } of pending.values()) reject(error)
        pending.clear()
        w.terminate()
        if (worker === w) worker = null
    }
    w.onerror = (err) => failAll(new Error(err.message || 'H5 worker crashed'))
    // Fires when a reply cannot be deserialised — without it the matching
    // request would never settle and the caller would wait forever.
    w.onmessageerror = () => failAll(new Error('H5 worker reply could not be deserialised'))
    worker = w
    return w
}

export function loadH5FileInWorker(
    file: File,
    dims: [number, number, number] = VOLUME_DIMS,
): Promise<H5VolumeData> {
    return new Promise<H5VolumeData>((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        try {
            getWorker().postMessage({ id, file, dims } satisfies WorkerRequest)
        } catch (err) {
            // Synchronous spawn/post failure — clean up the pending entry so it
            // cannot leak, and surface the error to the caller.
            pending.delete(id)
            reject(err instanceof Error ? err : new Error(String(err)))
        }
    })
}
