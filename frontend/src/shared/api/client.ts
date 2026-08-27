import type {
    FilterStep,
    LocalVolume,
    MeasureRequest,
    MeasureResult,
    SessionRequest,
    SessionStatus,
    SubmissionOptions,
    SubmissionResult,
    UploadResponse,
} from './types'
import type { CropBox, H5VolumeData } from '../types/viewer.types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const CONTENT_TYPE_JSON = 'application/json'
const HEADER_X_SHAPE = 'X-Shape'
const HEADER_X_VCOUNT = 'X-VCount'
// Byte width of one Float32 — used to compute the offsets of the packed views below.
const BYTES_PER_FLOAT32 = 4

/**
 * Typed wrappers around every backend endpoint the UI calls.
 *
 * All of them resolve against `VITE_API_URL` (Docker env or local `.env`), so the
 * host is configured in exactly one place. Endpoints that return volume data answer
 * with the packed binary described in `docs/12-api-reference.md` rather than JSON;
 * `parseShapeHeader` reads the `X-Shape`/`X-VCount` headers that describe it.
 */

/**
 * Parse a JSON response body as `T`. This is the single place where unvalidated
 * network JSON is asserted into a typed shape; callers must `res.ok`-check first.
 */
function getJson<T>(res: Response): Promise<T> {
    return res.json() as Promise<T>
}

/**
 * Parse the `X-Shape` response header into exactly `expectedDims` finite numbers,
 * throwing on a missing, wrong-length, or non-numeric header. Guards the typed-array
 * allocations below against `NaN` dimensions from a garbled response.
 */
function parseShapeHeader(res: Response, expectedDims: number): number[] {
    const shapeHeader = res.headers.get(HEADER_X_SHAPE)
    if (!shapeHeader) throw new Error('Missing X-Shape header')
    const parts = shapeHeader.split(',').map(Number)
    if (parts.length !== expectedDims || parts.some((n) => !Number.isFinite(n)))
        throw new Error(`Invalid X-Shape header: "${shapeHeader}"`)
    return parts
}

/**
 * Extract a sub-volume crop server-side and return the new volume's id + dims.
 * Non-destructive: the backend writes a fresh `.h5` and never touches the source.
 * The returned id can be loaded exactly like any uploaded volume.
 */
export async function cropVolume(
    volumeId: string,
    box: CropBox,
    shape: 'rect' | 'cylinder' | 'sphere' = 'rect',
): Promise<UploadResponse> {
    const res = await fetch(`${BASE_URL}/volumes/${volumeId}/crop`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({
            x: box.x,
            y: box.y,
            z: box.z,
            width: box.w,
            height: box.h,
            depth: box.d,
            shape,
        }),
    })
    if (!res.ok) throw new Error(`Crop failed: ${await res.text()}`)
    return getJson<UploadResponse>(res)
}

/**
 * Build the challenge-submission files from a (stitched) volume on the backend.
 * Returns the written `.h5` name, base64 PNG previews, and depth/mask statistics.
 */
export async function buildSubmission(
    volumeId: string,
    opts: SubmissionOptions = {},
): Promise<SubmissionResult> {
    const res = await fetch(`${BASE_URL}/volumes/${volumeId}/submission`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify(opts),
    })
    if (!res.ok) throw new Error(`Build submission failed: ${await res.text()}`)
    return getJson<SubmissionResult>(res)
}

export async function uploadVolume(file: File, signal?: AbortSignal): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/volumes/upload`, { method: 'POST', body: form, signal })
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
    return getJson<UploadResponse>(res)
}

/** List `.h5` source files available on the server under its `data_dir`. */
export async function listLocalVolumes(): Promise<LocalVolume[]> {
    const res = await fetch(`${BASE_URL}/volumes/local`)
    if (!res.ok) throw new Error(`Listing local volumes failed: ${await res.text()}`)
    return getJson<LocalVolume[]>(res)
}

/**
 * Register a server-side `.h5` by path instead of uploading its bytes. The
 * backend symlinks the file (zero-copy) and returns the same shape as upload.
 */
export async function registerLocalVolume(path: string): Promise<UploadResponse> {
    const res = await fetch(`${BASE_URL}/volumes/register`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({ path }),
    })
    if (!res.ok) throw new Error(`Register failed: ${await res.text()}`)
    return getJson<UploadResponse>(res)
}

/**
 * Register several server-side `.h5` files by path in a single round-trip.
 * Equivalent to calling {@link registerLocalVolume} per path but avoids the
 * N+1 request storm when adding many tiles (e.g. a 25-volume stitch grid).
 */
export async function registerLocalVolumesBatch(paths: string[]): Promise<UploadResponse[]> {
    const res = await fetch(`${BASE_URL}/volumes/register-batch`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({ paths }),
    })
    if (!res.ok) throw new Error(`Batch register failed: ${await res.text()}`)
    return getJson<UploadResponse[]>(res)
}

// ── Multi-volume stitching sessions ──────────────────────────────────────────

export async function createSession(
    req: SessionRequest,
    signal?: AbortSignal,
): Promise<{ session_id: string }> {
    const res = await fetch(`${BASE_URL}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify(req),
        signal,
    })
    if (!res.ok) throw new Error(`Session creation failed: ${await res.text()}`)
    return getJson<{ session_id: string }>(res)
}

export async function pollSession(sessionId: string, signal?: AbortSignal): Promise<SessionStatus> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`, { signal })
    if (!res.ok) throw new Error(`Session poll failed: ${await res.text()}`)
    return getJson<SessionStatus>(res)
}

export async function cleanupUploads(): Promise<void> {
    // Trailing slash matters: the backend route is /cleanup/ and a slash-less
    // request would only work via an extra 307 redirect round-trip.
    const res = await fetch(`${BASE_URL}/cleanup/`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Cleanup failed: ${await res.text()}`)
}

// ── Normalised-binary endpoints ───────────────────────────────────────────────
//
// The backend now returns render-ready binary instead of raw float32.
// Layout: [vIndices uint32 × vCount][vIntensities float32 × vCount][normalizedVolume uint8 × total]
// Headers: X-Shape (nSlices,height,width)  X-VCount (above-threshold voxel count)
//
// The frontend creates three typed-array views into the single response ArrayBuffer —
// no copy, no Web Worker, no normalization computation needed.

/**
 * Stream the response body into a single pre-sized ArrayBuffer.
 *
 * `X-Shape`/`X-VCount` tell us the exact payload size up front, so we allocate
 * once and fill it chunk-by-chunk via the stream reader. This avoids the
 * transient double-allocation that `res.arrayBuffer()` can incur while it grows
 * its internal buffer — important for the multi-hundred-MB stitched-volume
 * payloads. Falls back to `arrayBuffer()` when streams are unavailable.
 */
async function streamBodyInto(res: Response, byteLength: number): Promise<ArrayBuffer> {
    const reader = res.body?.getReader()
    if (!reader) {
        const buf = await res.arrayBuffer()
        if (buf.byteLength !== byteLength)
            throw new Error(
                `Truncated volume response: expected ${byteLength} bytes, got ${buf.byteLength}`,
            )
        return buf
    }

    const out = new Uint8Array(byteLength)
    let offset = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        // Guard against a server sending more bytes than advertised. Cancel the
        // stream so the connection is released instead of left dangling open.
        const remaining = byteLength - offset
        if (value.length > remaining) {
            out.set(value.subarray(0, remaining), offset)
            offset = byteLength
            void reader.cancel()
            break
        }
        out.set(value, offset)
        offset += value.length
    }
    // A short read (aborted/interrupted connection) would otherwise leave the
    // tail zero-filled and be silently rendered as a valid — but corrupt — volume.
    if (offset !== byteLength)
        throw new Error(`Truncated volume response: expected ${byteLength} bytes, got ${offset}`)
    return out.buffer
}

async function parseNormalizedVolume(res: Response): Promise<H5VolumeData> {
    if (!res.ok) throw new Error(`Loading volume failed (${res.status}): ${await res.text()}`)
    const vCountHeader = res.headers.get(HEADER_X_VCOUNT)
    if (!vCountHeader) throw new Error('Missing X-VCount header')
    const [nSlices, height, width] = parseShapeHeader(res, 3)
    const vCount = parseInt(vCountHeader, 10)
    if (!Number.isFinite(vCount) || vCount < 0)
        throw new Error(`Invalid X-VCount header: "${vCountHeader}"`)
    const total = nSlices * height * width

    const byteLength = vCount * BYTES_PER_FLOAT32 * 2 + total
    const buf = await streamBodyInto(res, byteLength)
    // Three views into the same buffer — zero copy. Indices are uint32 (4 bytes,
    // same stride as the following float32 intensities); see H5VolumeData.
    const vIndices = new Uint32Array(buf, 0, vCount)
    const vIntensities = new Float32Array(buf, vCount * BYTES_PER_FLOAT32, vCount)
    const normalizedVolume = new Uint8Array(buf, vCount * BYTES_PER_FLOAT32 * 2, total)
    return { nSlices, height, width, vIndices, vIntensities, normalizedVolume }
}

/**
 * Fetch a stored/registered volume pre-normalised by the backend — render-ready,
 * no upload and no h5wasm worker needed (used for server-side file selection).
 */
export async function fetchNormalizedVolume(volumeId: string): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/volumes/${volumeId}/normalized`)
    return parseNormalizedVolume(res)
}

export async function fetchSessionMerged(
    sessionId: string,
    signal?: AbortSignal,
): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/merged`, { signal })
    return parseNormalizedVolume(res)
}

export async function filterSessionVolume(
    sessionId: string,
    filterChain: FilterStep[],
): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({ filter_chain: filterChain }),
    })
    return parseNormalizedVolume(res)
}

/**
 * Apply a filter chain to a stored/registered volume via the lean preprocessing
 * endpoint. Unlike the job pipeline this runs no stitcher and computes no metrics,
 * so it returns the filtered (positionally unchanged) volume in a single request —
 * no polling. Result is the render-ready normalised binary.
 */
export async function filterVolume(
    volumeId: string,
    filterChain: FilterStep[],
): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/volumes/${volumeId}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify({ filter_chain: filterChain }),
    })
    return parseNormalizedVolume(res)
}

/** Request geometric measurements (area, volume, thickness, diameter) for a volume. */
export async function measureVolume(
    volumeId: string,
    req: MeasureRequest = {},
): Promise<MeasureResult> {
    const res = await fetch(`${BASE_URL}/volumes/${volumeId}/measure`, {
        method: 'POST',
        headers: { 'Content-Type': CONTENT_TYPE_JSON },
        body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`Measurement failed: ${await res.text()}`)
    return getJson<MeasureResult>(res)
}
