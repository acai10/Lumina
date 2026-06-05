import { loadH5File } from './h5Reader'
import type { WorkerResponse } from './h5Reader'
import { normalizeVolume } from './h5Normalizer'

type WorkerInput =
    | { file: File; dims: [number, number, number] }
    | {
          raw: Float32Array
          dims: [number, number, number]
          threshold: number
          skipNormalizedVolume?: boolean
      }

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
    try {
        const result =
            'file' in e.data
                ? await loadH5File(e.data.file, e.data.dims)
                : normalizeVolume(
                      e.data.raw,
                      e.data.dims,
                      e.data.threshold,
                      e.data.skipNormalizedVolume ?? false,
                  )
        const transferables = [result.vIndices.buffer, result.vIntensities.buffer] as ArrayBuffer[]
        if (result.normalizedVolume) {
            // normalizedVolume is Uint8Array — transfer its underlying ArrayBuffer.
            transferables.push(result.normalizedVolume.buffer as ArrayBuffer)
        }
        const response: WorkerResponse = { ok: true, result }
        self.postMessage(response, { transfer: transferables })
    } catch (err) {
        const response: WorkerResponse = { ok: false, error: String(err) }
        self.postMessage(response)
    }
}
