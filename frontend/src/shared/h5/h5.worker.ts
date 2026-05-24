import { loadH5File } from './h5Reader'
import { normalizeVolume } from './h5Normalizer'

type WorkerInput =
    | { file: File; dims: [number, number, number] }
    | { raw: Float32Array; dims: [number, number, number]; threshold: number }

self.onmessage = async (e: MessageEvent<WorkerInput>) => {
    try {
        const result =
            'file' in e.data
                ? await loadH5File(e.data.file, e.data.dims)
                : normalizeVolume(e.data.raw, e.data.dims, e.data.threshold)
        self.postMessage(
            { ok: true, result },
            { transfer: [result.vIndices.buffer, result.vIntensities.buffer] },
        )
    } catch (err) {
        self.postMessage({ ok: false, error: String(err) })
    }
}
