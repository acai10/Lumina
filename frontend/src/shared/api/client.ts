import type {
    FilterStep,
    JobRequest,
    JobStatus,
    LocalVolume,
    SessionRequest,
    SessionStatus,
    UploadResponse,
} from './types'
import type { H5VolumeData } from '../types/viewer.types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const CONTENT_TYPE_JSON = 'application/json'
const HEADER_X_SHAPE = 'X-Shape'
const HEADER_X_VCOUNT = 'X-VCount'
// Byte width of one Float32 — used to compute the offsets of the packed views below.
const BYTES_PER_FLOAT32 = 4

// A hung backend must not leave spinners up forever. The default covers JSON
// endpoints; volume transfers move ~100–200 MB so they get a much longer window.
// The timer covers time-to-headers; body streaming is not bounded by it.
const DEFAULT_TIMEOUT_MS = 30_000
const VOLUME_TRANSFER_TIMEOUT_MS = 300_000

async function apiFetch(
    path: string,
    init: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
        return await fetch(`${BASE_URL}${path}`, { ...init, signal: ctrl.signal })
    } catch (err) {
        if (ctrl.signal.aborted) {
            throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${path}`, {
                cause: err,
            })
        }
        throw err
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Parse a JSON response body as `T`. This is the single place where unvalidated
 * network JSON is asserted into a typed shape; callers must `res.ok`-check first.
 */
function getJson<T>(res: Response): Promise<T> {
    return res.json() as Promise<T>
}

export async function uploadVolume(file: File): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch(
        '/volumes/upload',
        { method: 'POST', body: form },
        VOLUME_TRANSFER_TIMEOUT_MS,
    )
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
    return getJson<UploadResponse>(res)
}

/** List `.h5` source files available on the server under its `data_dir`. */
export async function listLocalVolumes(): Promise<LocalVolume[]> {
    const res = await apiFetch('/volumes/local')
    if (!res.ok) throw new Error(`Listing local volumes failed: ${await res.text()}`)
    return getJson<LocalVolume[]>(res)
}

/**
 * Register a server-side `.h5` by path instead of uploading its bytes. The
 * backend symlinks the file (zero-copy) and returns the same shape as upload.
 */
export async function registerLocalVolume(path: string): Promise<UploadResponse> {
    const res = await apiFetch('/volumes/register', {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({ path }),
    })
    if (!res.ok) throw new Error(`Register failed: ${await res.text()}`)
    return getJson<UploadResponse>(res)
}

export async function createJob(req: JobRequest): Promise<{ job_id: string }> {
    const res = await apiFetch('/jobs/', {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`Job creation failed: ${await res.text()}`)
    return getJson<{ job_id: string }>(res)
}

export async function pollJob(jobId: string): Promise<JobStatus> {
    const res = await apiFetch(`/jobs/${jobId}`)
    if (!res.ok) throw new Error(`Poll failed: ${await res.text()}`)
    return getJson<JobStatus>(res)
}

// ── Multi-volume stitching sessions ──────────────────────────────────────────

export async function createSession(req: SessionRequest): Promise<{ session_id: string }> {
    const res = await apiFetch('/sessions/', {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`Session creation failed: ${await res.text()}`)
    return getJson<{ session_id: string }>(res)
}

export async function pollSession(sessionId: string): Promise<SessionStatus> {
    const res = await apiFetch(`/sessions/${sessionId}`)
    if (!res.ok) throw new Error(`Session poll failed: ${await res.text()}`)
    return getJson<SessionStatus>(res)
}

export async function fetchSessionMip(
    sessionId: string,
): Promise<{ data: Float32Array; shape: [number, number] }> {
    const res = await apiFetch(`/sessions/${sessionId}/mip`, {}, VOLUME_TRANSFER_TIMEOUT_MS)
    if (!res.ok) throw new Error(`MIP fetch failed: ${await res.text()}`)
    const shapeHeader = res.headers.get(HEADER_X_SHAPE)
    if (!shapeHeader) throw new Error('Missing X-Shape header in MIP response')
    const parts = shapeHeader.split(',').map(Number)
    if (parts.length !== 2 || parts.some(isNaN)) throw new Error('Invalid X-Shape header')
    const shape: [number, number] = [parts[0], parts[1]]
    const buf = await res.arrayBuffer()
    return { data: new Float32Array(buf), shape }
}

export async function cleanupUploads(): Promise<void> {
    const res = await apiFetch('/cleanup', { method: 'DELETE' })
    if (!res.ok) throw new Error(`Cleanup failed: ${await res.text()}`)
}

// ── Normalised-binary endpoints ───────────────────────────────────────────────
//
// The backend now returns render-ready binary instead of raw float32.
// Layout: [vIndices float32 × vCount][vIntensities float32 × vCount][normalizedVolume uint8 × total]
// Headers: X-Shape (nSlices,height,width)  X-VCount (above-threshold voxel count)
//
// The frontend creates three typed-array views into the single response ArrayBuffer —
// no copy, no Web Worker, no normalization computation needed.

async function parseNormalizedVolume(res: Response): Promise<H5VolumeData> {
    if (!res.ok) throw new Error(await res.text())
    const shapeHeader = res.headers.get(HEADER_X_SHAPE)
    const vCountHeader = res.headers.get(HEADER_X_VCOUNT)
    if (!shapeHeader || !vCountHeader) throw new Error('Missing X-Shape or X-VCount header')

    // Validate before constructing views — malformed headers would otherwise
    // surface as an opaque RangeError (or worse, views over garbage bytes).
    const parts = shapeHeader.split(',').map(Number)
    if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
        throw new Error(`Invalid ${HEADER_X_SHAPE} header: "${shapeHeader}"`)
    }
    const [nSlices, height, width] = parts
    const vCount = parseInt(vCountHeader, 10)
    if (!Number.isInteger(vCount) || vCount < 0) {
        throw new Error(`Invalid ${HEADER_X_VCOUNT} header: "${vCountHeader}"`)
    }
    const total = nSlices * height * width

    const buf = await res.arrayBuffer()
    const expectedBytes = vCount * BYTES_PER_FLOAT32 * 2 + total
    if (buf.byteLength < expectedBytes) {
        throw new Error(
            `Truncated volume response: got ${buf.byteLength} bytes, expected ${expectedBytes}`,
        )
    }
    // Three views into the same buffer — zero copy.
    const vIndices = new Float32Array(buf, 0, vCount)
    const vIntensities = new Float32Array(buf, vCount * BYTES_PER_FLOAT32, vCount)
    const normalizedVolume = new Uint8Array(buf, vCount * BYTES_PER_FLOAT32 * 2, total)
    return { nSlices, height, width, vIndices, vIntensities, normalizedVolume }
}

export async function fetchResultVolume(jobId: string, stitcher: string): Promise<H5VolumeData> {
    const res = await apiFetch(`/jobs/${jobId}/volume/${stitcher}`, {}, VOLUME_TRANSFER_TIMEOUT_MS)
    return parseNormalizedVolume(res)
}

/**
 * Fetch a stored/registered volume pre-normalised by the backend — render-ready,
 * no upload and no h5wasm worker needed (used for server-side file selection).
 */
export async function fetchNormalizedVolume(volumeId: string): Promise<H5VolumeData> {
    const res = await apiFetch(`/volumes/${volumeId}/normalized`, {}, VOLUME_TRANSFER_TIMEOUT_MS)
    return parseNormalizedVolume(res)
}

export async function fetchSessionMerged(sessionId: string): Promise<H5VolumeData> {
    const res = await apiFetch(`/sessions/${sessionId}/merged`, {}, VOLUME_TRANSFER_TIMEOUT_MS)
    return parseNormalizedVolume(res)
}

export async function filterSessionVolume(
    sessionId: string,
    filterChain: FilterStep[],
): Promise<H5VolumeData> {
    const res = await apiFetch(
        `/sessions/${sessionId}/filter`,
        {
            method: 'POST',
            headers: { 'Content-Type': CONTENT_TYPE_JSON },
            body: JSON.stringify({ filter_chain: filterChain }),
        },
        VOLUME_TRANSFER_TIMEOUT_MS,
    )
    return parseNormalizedVolume(res)
}
