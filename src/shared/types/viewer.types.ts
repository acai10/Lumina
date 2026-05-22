export interface H5Meta {
    nSlices: number
    height: number
    width: number
}

export interface H5VolumeData extends H5Meta {
    slices: Uint8Array[]
}

export interface H5FileEntry {
    name: string
    data: H5VolumeData
}

export interface H5PerFileState {
    sliceIndex: number | null
    cameraPosition: [number, number, number]
    cameraQuaternion: [number, number, number, number]
    controlsTarget: [number, number, number]
}
