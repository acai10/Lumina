import type { H5UploadResponse } from '../types/viewer.types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, init)
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText)
        throw new Error(`${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
}

// Backend returns snake_case; map to camelCase at the boundary.
interface RawUploadResponse {
    n_slices: number
    height: number
    width: number
    slices: string[]
}

export async function uploadH5(file: File): Promise<H5UploadResponse> {
    const form = new FormData()
    form.append('file', file)
    const raw = await request<RawUploadResponse>('/h5/upload', { method: 'POST', body: form })
    return { nSlices: raw.n_slices, height: raw.height, width: raw.width, slices: raw.slices }
}
