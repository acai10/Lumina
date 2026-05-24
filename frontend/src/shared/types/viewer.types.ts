export interface H5Meta {
    nSlices: number
    height: number
    width: number
}

export interface H5VolumeData extends H5Meta {
    vIndices: Float32Array
    vIntensities: Float32Array
    normalizedVolume: Float32Array
}

export interface H5FileEntry {
    name: string
    data: H5VolumeData
    sourceFile: File
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
}

export interface H5PerFileState {
    cameraPosition?: [number, number, number]
    cameraQuaternion?: [number, number, number, number]
    controlsTarget?: [number, number, number]
    renderControls: H5RenderControls
    isFiltering?: boolean
    viewMode?: 'pointcloud' | 'slice'
    sliceIndex?: number
}
