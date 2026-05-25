import { loadH5File } from './h5Reader'
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
        if (result.normalizedVolume)
            transferables.push(result.normalizedVolume.buffer as ArrayBuffer)
        self.postMessage({ ok: true, result }, { transfer: transferables })
    } catch (err) {
        self.postMessage({ ok: false, error: String(err) })
    }
}
