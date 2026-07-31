import { loadH5File } from './h5Reader'
import type { WorkerRequest, WorkerResponse } from './h5WorkerClient'

// One long-lived worker serves many files (see h5WorkerClient), so each request
// carries an id that we echo back on the response for correlation.
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const { id, file, dims } = e.data
    try {
        const result = await loadH5File(file, dims)
        const transferables = [result.vIndices.buffer, result.vIntensities.buffer] as ArrayBuffer[]
        if (result.normalizedVolume) {
            // normalizedVolume is Uint8Array — transfer its underlying ArrayBuffer.
            transferables.push(result.normalizedVolume.buffer as ArrayBuffer)
        }
        const response: WorkerResponse = { id, ok: true, result }
        self.postMessage(response, { transfer: transferables })
    } catch (err) {
        // Error.message instead of String(err): the latter would prefix the
        // user-facing snackbar text with a redundant "Error: ".
        const message = err instanceof Error ? err.message : String(err)
        const response: WorkerResponse = { id, ok: false, error: message }
        self.postMessage(response)
    }
}
