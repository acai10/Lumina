export type FilterType = 'gaussian' | 'median' | 'lee' | 'bm3d' | 'normalize' | 'anisotropy'

export interface FilterStep {
    type: FilterType
    params: Record<string, unknown>
}

export interface JobRequest {
    volume_id: string
    filter_chain: FilterStep[]
    stitchers: string[]
}

export interface JobStatus {
    status: 'pending' | 'running' | 'done' | 'error'
    results: Record<string, Record<string, number>>
    error?: string
}

export interface UploadResponse {
    volume_id: string
    n_slices: number
    height: number
    width: number
}
