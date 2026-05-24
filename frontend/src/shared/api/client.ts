import type { JobRequest, JobStatus, UploadResponse } from './types'

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

export async function fetchResultVolume(
    jobId: string,
    stitcher: string,
): Promise<{ data: Float32Array; shape: [number, number, number] }> {
    const res = await fetch(`${BASE_URL}/jobs/${jobId}/volume/${stitcher}`)
    if (!res.ok) throw new Error(`Fetch result failed: ${await res.text()}`)
    const shapeHeader = res.headers.get('X-Shape')
    if (!shapeHeader) throw new Error('Missing X-Shape header in result response')
    const shape = shapeHeader.split(',').map(Number) as [number, number, number]
    const buf = await res.arrayBuffer()
    return { data: new Float32Array(buf), shape }
}
