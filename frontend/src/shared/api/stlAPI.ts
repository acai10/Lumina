import type { STLData } from '../types/stl.types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function uploadSTL(file: File): Promise<STLData> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE_URL}/stl/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<STLData>;
}
