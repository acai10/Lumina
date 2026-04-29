import type {
    AScanResponse,
    FilterResponse,
    SegmentationResponse,
    UploadResponse,
    SliceResponse,
} from '../types/oct.types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function uploadScan(file: File): Promise<UploadResponse> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/oct/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<UploadResponse>;
}

export async function fetchSlice(index: number): Promise<SliceResponse> {
    const res = await fetch(`${BASE_URL}/oct/slice/${index}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<SliceResponse>;
}

export async function fetchAScan(x: number, sliceIndex: number): Promise<AScanResponse> {
    const res = await fetch(`${BASE_URL}/oct/ascan?x=${x}&slice=${sliceIndex}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<AScanResponse>;
}

export async function applyFilterToStored(
    filterType: string,
    params?: Record<string, number>,
): Promise<FilterResponse> {
    const form = new FormData();
    form.append('filter_type', filterType);
    if (params) form.append('params', JSON.stringify(params));
    const res = await fetch(`${BASE_URL}/filters/apply`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<FilterResponse>;
}

export async function runSegmentationOnStored(method: string): Promise<SegmentationResponse> {
    const form = new FormData();
    form.append('method', method);
    const res = await fetch(`${BASE_URL}/segmentation/run`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<SegmentationResponse>;
}
