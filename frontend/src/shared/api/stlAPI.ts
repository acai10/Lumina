import type { STLData } from '../types/stl.types';
import { request } from './client';

export async function uploadSTL(file: File): Promise<STLData> {
    const form = new FormData();
    form.append('file', file);
    return request<STLData>('/stl/upload', { method: 'POST', body: form });
}
