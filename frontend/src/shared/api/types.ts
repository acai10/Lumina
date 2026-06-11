export type FilterType = 'gaussian' | 'median' | 'mean' | 'normalize' | 'edge'

/**
 * A single preprocessing step. Discriminated on `type` so each filter's `params`
 * are exactly the keys the backend expects — no `Record<string, unknown>`.
 */
export type FilterStep =
    | { type: 'gaussian'; params: { sigma: number } }
    | { type: 'median'; params: { size: number } }
    | { type: 'mean'; params: { size: number } }
    | { type: 'normalize'; params: { low_percentile: number; high_percentile: number } }
    | { type: 'edge'; params: Record<string, never> }

export interface JobRequest {
    volume_id: string
    filter_chain: FilterStep[]
    stitchers: string[]
}

export const JOB_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    ERROR: 'error',
} as const

export type JobStatusValue = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

export interface JobStatus {
    status: JobStatusValue
    results: Record<string, Record<string, number>>
    error?: string
}

export interface UploadResponse {
    volume_id: string
    n_slices: number
    height: number
    width: number
}

/** A source `.h5` file available on the server under `data_dir`. */
export interface LocalVolume {
    path: string // relative to data_dir, e.g. "subdir/scan.h5"
    name: string // display name (filename)
}

// ── Multi-volume stitching sessions ──────────────────────────────────────────

export const REGISTRATION_METHOD = {
    PHASE_CORRELATION: 'phase_correlation',
    CROSS_CORRELATION: 'cross_correlation',
} as const

export type RegistrationMethod = (typeof REGISTRATION_METHOD)[keyof typeof REGISTRATION_METHOD]

export interface VolumeEntry {
    volume_id: string
    row: number
    col: number
}

export interface SessionRequest {
    volumes: VolumeEntry[]
    method: RegistrationMethod
    method_params: Record<string, unknown>
}

export interface SessionStatus {
    status: JobStatusValue
    offsets: Record<string, [number, number]>
    metrics: Record<string, number>
    merged_volume_id?: string
    error?: string
}

export interface SessionFilterRequest {
    filter_chain: FilterStep[]
}
