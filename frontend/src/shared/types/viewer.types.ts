export interface H5Meta {
    nSlices: number
    height: number
    width: number
}

export interface H5VolumeData extends H5Meta {
    vIndices: Float32Array
    vIntensities: Float32Array
    // Uint8Array (values 0-255) instead of Float32Array to cut memory 4×.
    // Divide by 255 when a 0-1 float is needed (e.g. SlicePanel canvas rendering).
    normalizedVolume: Uint8Array | null
}

/** Input shape for loadH5 — the store adds `type: 'h5'` internally. */
export interface H5FileEntry {
    name: string
    data: H5VolumeData
    sourceFile?: File
    backendVolumeId?: string
    // Single volume registered server-side by path (job pipeline). Distinct from
    // `backendVolumeId`, which is a merged *session* id using the session filter.
    registeredVolumeId?: string
}

/**
 * Full H5 tab as stored in the unified tabs array.
 *
 * `data` holds the heavy buffers only while the tab is *hydrated*. Inactive tabs
 * are evicted to IndexedDB (see shared/h5/volumeCache) and carry `data: null` to
 * keep the JS heap small; `meta` and `hasSlices` stay resident so the UI can render
 * sliders, dimensions and the view toggle without the buffers present.
 */
export interface H5TabEntry {
    type: 'h5'
    name: string
    meta: H5Meta
    data: H5VolumeData | null
    hasSlices: boolean
    sourceFile?: File
    backendVolumeId?: string
    registeredVolumeId?: string
}

/** STL tab stored in the unified tabs array. */
export interface StlTabEntry {
    type: 'stl'
    name: string
    file: File
}

export type TabEntry = H5TabEntry | StlTabEntry

export interface H5RenderControls {
    volumeSpacing: number
    h5Threshold: number
    h5Opacity: number
    h5Brightness: number
    h5Contrast: number
    h5PointSize: number
    h5SliceRange: [number, number]
    h5WidthRange: [number, number]
    h5HeightRange: [number, number]
}

export interface SlicePanelControl {
    brightness: number
    contrast: number
}

export interface H5PerFileState {
    cameraPosition?: [number, number, number]
    cameraQuaternion?: [number, number, number, number]
    controlsTarget?: [number, number, number]
    renderControls: H5RenderControls
    isFiltering?: boolean
    viewMode?: 'pointcloud' | 'slice'
    sliceIndex?: number
    sliceY?: number
    sliceX?: number
    slicePanelControls?: {
        z: SlicePanelControl
        y: SlicePanelControl
        x: SlicePanelControl
    }
}
