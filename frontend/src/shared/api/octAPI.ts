import type {
    AScanResponse,
    FilterResponse,
    SegmentationResponse,
    SliceResponse,
    UploadResponse,
} from '../types/oct.types';
import { request } from './client';

export async function uploadScan(file: File): Promise<UploadResponse> {
    const form = new FormData();
    form.append('file', file);
    return request<UploadResponse>('/oct/upload', { method: 'POST', body: form });
}

export async function fetchSlice(index: number): Promise<SliceResponse> {
    return request<SliceResponse>(`/oct/slice/${index}`);
}

export async function fetchAScan(x: number, sliceIndex: number): Promise<AScanResponse> {
    return request<AScanResponse>(`/oct/ascan?x=${x}&slice=${sliceIndex}`);
}

export async function applyFilterToStored(
    filterType: string,
    params?: Record<string, number>,
): Promise<FilterResponse> {
    const form = new FormData();
    form.append('filter_type', filterType);
    if (params) form.append('params', JSON.stringify(params));
    return request<FilterResponse>('/filters/apply', { method: 'POST', body: form });
}

export async function runSegmentationOnStored(method: string): Promise<SegmentationResponse> {
    const form = new FormData();
    form.append('method', method);
    return request<SegmentationResponse>('/segmentation/run', { method: 'POST', body: form });
}
