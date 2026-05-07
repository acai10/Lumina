import { create } from 'zustand';

import type { STLData } from '../../shared/types/stl.types';

interface STLState {
    stlData: STLData | null;
    isLoading: boolean;
    error: string | null;

    setSTLData: (data: STLData) => void;
    setLoading: (v: boolean) => void;
    clearSTL: () => void;
    setError: (e: string | null) => void;
}

export const useSTLStore = create<STLState>((set) => ({
    stlData: null,
    isLoading: false,
    error: null,

    setSTLData: (data) => set({ stlData: data }),
    setLoading: (v) => set({ isLoading: v }),
    clearSTL: () => set({ stlData: null }),
    setError: (e) => set({ error: e }),
}));
