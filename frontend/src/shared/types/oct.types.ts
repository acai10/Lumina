export type OCTScanType = 'A' | 'B' | 'C';

export interface UploadResponse {
    scan_type: OCTScanType;
    n_slices: number;
    width: number;
    height: number;
    preview: string; // base64 PNG
}

export interface SliceResponse {
    slice_index: number;
    image: string; // base64 PNG
}

export interface AScanResponse {
    signal: number[];
    depth_axis: number[];
}

export interface FilterRequest {
    filter_type: 'gaussian' | 'median' | 'speckle_reduction';
    params?: Record<string, number>;
}

export interface FilterResponse {
    result: string; // base64 PNG
}

export interface SegmentationRequest {
    method: 'threshold' | 'graph_cut';
}

export interface SegmentationResponse {
    result: string; // base64 PNG
    mask: string; // base64 PNG
}
