export type FilterType = 'gaussian' | 'median' | 'mean' | 'normalize' | 'edge' | 'segment'

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
    | { type: 'segment'; params: Record<string, never> }

export const JOB_STATUS = {
    PENDING: 'pending',
    RUNNING: 'running',
    DONE: 'done',
    ERROR: 'error',
} as const

export type JobStatusValue = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

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

// ── Measurements ─────────────────────────────────────────────────────────────

/** Body of `POST /volumes/{id}/measure`. */
export interface MeasureRequest {
    threshold?: number
    /** Physical voxel size in µm as **(dz, dy, dx)** — axial spacing first. */
    voxel_size_um?: [number, number, number]
}

/** Geometric measurements returned by `POST /volumes/{id}/measure`. */
export interface MeasureResult {
    voxel_count: number
    volume_um3: number
    surface_area_um2: number
    mean_thickness_um: number
    max_thickness_um: number
    lateral_diameter_um: number
}

// ── Challenge submission ─────────────────────────────────────────────────────

/** Options for building a challenge submission from a stored/stitched volume. */
export interface SubmissionOptions {
    /** Tissue dataset → also produce a muscle/fat mask. */
    tissue?: boolean
    /** Voxel spacing in mm; defaults to the backend's lateral 0.02 mm/px (dx, dy,
     *  = 5 mm FOV / 250 px) and axial 0.00519 mm/px (dz). */
    dx?: number
    dy?: number
    dz?: number
}

/** Depth/mask statistics returned alongside a built submission. */
export interface SubmissionStats {
    shape: [number, number]
    coverage_pct: number
    depth_min_mm: number
    depth_max_mm: number
    depth_mean_mm: number
    dx_mm: number
    dy_mm: number
    dz_mm: number
    /** Present only for the tissue dataset (a mask was produced). */
    muscle_pct?: number
}

/** Result of building a submission: file name, base64 PNG previews, and stats. */
export interface SubmissionResult {
    volume_id: string
    h5_filename: string
    surface_png: string
    mask_png: string | null
    stats: SubmissionStats
}
