const BASE_URL = /*import.meta.env.VITE_API_URL ??*/ 'http://localhost:8000';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, init);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}
