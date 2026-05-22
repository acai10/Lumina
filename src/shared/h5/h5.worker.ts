import { loadH5File } from './h5Reader'

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
    try {
        const result = await loadH5File(e.data.file)
        const transferable = result.slices.map((s) => s.buffer as ArrayBuffer)
        self.postMessage({ ok: true, result }, { transfer: transferable })
    } catch (err) {
        self.postMessage({ ok: false, error: String(err) })
    }
}
