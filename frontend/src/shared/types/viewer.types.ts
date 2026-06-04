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
}

/** Full H5 tab as stored in the unified tabs array. */
export interface H5TabEntry extends H5FileEntry {
    type: 'h5'
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
