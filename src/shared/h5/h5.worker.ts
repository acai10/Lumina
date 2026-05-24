import { loadH5File } from './h5Reader'
import type { FilterParams } from '../types/viewer.types'

type WorkerMessage =
    | { type: 'LOAD'; file: File; dims: [number, number, number] }
    | { type: 'REPROCESS'; file: File; dims: [number, number, number]; filterParams: FilterParams }

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    try {
        const filterParams: FilterParams =
            e.data.type === 'REPROCESS' ? e.data.filterParams : { type: 'none' }
        const result = await loadH5File(e.data.file, e.data.dims, filterParams)
        const transferable = [result.vIndices.buffer, result.vIntensities.buffer]
        self.postMessage({ ok: true, result }, { transfer: transferable })
    } catch (err) {
        self.postMessage({ ok: false, error: String(err) })
    }
}
