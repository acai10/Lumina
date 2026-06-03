import type {
    FilterStep,
    JobRequest,
    JobStatus,
    SessionRequest,
    SessionStatus,
    UploadResponse,
} from './types'
import type { H5VolumeData } from '../types/viewer.types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function uploadVolume(file: File): Promise<UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE_URL}/volumes/upload`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
    return res.json() as Promise<UploadResponse>
}

export async function createJob(req: JobRequest): Promise<{ job_id: string }> {
    const res = await fetch(`${BASE_URL}/jobs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`Job creation failed: ${await res.text()}`)
    return res.json() as Promise<{ job_id: string }>
}

export async function pollJob(jobId: string): Promise<JobStatus> {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}`)
    if (!res.ok) throw new Error(`Poll failed: ${await res.text()}`)
    return res.json() as Promise<JobStatus>
}

// ── Multi-volume stitching sessions ──────────────────────────────────────────

export async function createSession(req: SessionRequest): Promise<{ session_id: string }> {
    const res = await fetch(`${BASE_URL}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
    })
    if (!res.ok) throw new Error(`Session creation failed: ${await res.text()}`)
    return res.json() as Promise<{ session_id: string }>
}

export async function pollSession(sessionId: string): Promise<SessionStatus> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}`)
    if (!res.ok) throw new Error(`Session poll failed: ${await res.text()}`)
    return res.json() as Promise<SessionStatus>
}

export async function fetchSessionMip(
    sessionId: string,
): Promise<{ data: Float32Array; shape: [number, number] }> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/mip`)
    if (!res.ok) throw new Error(`MIP fetch failed: ${await res.text()}`)
    const shapeHeader = res.headers.get('X-Shape')
    if (!shapeHeader) throw new Error('Missing X-Shape header in MIP response')
    const shape = shapeHeader.split(',').map(Number) as [number, number]
    const buf = await res.arrayBuffer()
    return { data: new Float32Array(buf), shape }
}

export async function cleanupUploads(): Promise<void> {
    const res = await fetch(`${BASE_URL}/cleanup`, { method: 'DELETE' })
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
    const shapeHeader = res.headers.get('X-Shape')
    const vCountHeader = res.headers.get('X-VCount')
    if (!shapeHeader || !vCountHeader) throw new Error('Missing X-Shape or X-VCount header')
    const [nSlices, height, width] = shapeHeader.split(',').map(Number)
    const vCount = parseInt(vCountHeader, 10)
    const total = nSlices * height * width

    const buf = await res.arrayBuffer()
    // Three views into the same buffer — zero copy.
    const vIndices = new Float32Array(buf, 0, vCount)
    const vIntensities = new Float32Array(buf, vCount * 4, vCount)
    const normalizedVolume = new Uint8Array(buf, vCount * 8, total)
    return { nSlices, height, width, vIndices, vIntensities, normalizedVolume }
}

export async function fetchResultVolume(jobId: string, stitcher: string): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}/volume/${stitcher}`)
    return parseNormalizedVolume(res)
}

export async function fetchSessionMerged(sessionId: string): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/merged`)
    return parseNormalizedVolume(res)
}

export async function filterSessionVolume(
    sessionId: string,
    filterChain: FilterStep[],
): Promise<H5VolumeData> {
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter_chain: filterChain }),
    })
    return parseNormalizedVolume(res)
}
