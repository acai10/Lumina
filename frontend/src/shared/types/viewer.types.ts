export interface H5Meta {
    nSlices: number
    height: number
    width: number
}

export interface H5UploadResponse extends H5Meta {
    slices: string[]
}

export interface H5FileEntry {
    name: string
    data: H5UploadResponse
}
