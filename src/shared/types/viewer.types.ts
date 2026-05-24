export interface H5Meta {
    nSlices: number
    height: number
    width: number
}

export interface H5VolumeData extends H5Meta {
    vIndices: Float32Array
    vIntensities: Float32Array
}

export type FilterParams =
    | { type: 'none' }
    | { type: 'gaussian'; sigma: number }
    | { type: 'median'; kernelRadius: number }

export interface H5FileEntry {
    name: string
    sourceFile: File
    data: H5VolumeData
}

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
    filterParams: FilterParams
}

export interface H5PerFileState {
    cameraPosition?: [number, number, number]
    cameraQuaternion?: [number, number, number, number]
    controlsTarget?: [number, number, number]
    renderControls: H5RenderControls
    isReprocessing: boolean
}
