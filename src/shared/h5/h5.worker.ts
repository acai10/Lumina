import { loadH5File } from './h5Reader'

self.onmessage = async (e: MessageEvent<{ file: File; dims: [number, number, number] }>) => {
    try {
        const result = await loadH5File(e.data.file, e.data.dims)
        const transferable = result.slices.map((s) => s.buffer as ArrayBuffer)
        self.postMessage({ ok: true, result }, { transfer: transferable })
    } catch (err) {
        self.postMessage({ ok: false, error: String(err) })
    }
}
