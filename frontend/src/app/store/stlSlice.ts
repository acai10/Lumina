import { create } from 'zustand';

import type { STLData } from '../../shared/types/stl.types';

interface STLState {
    stlData: STLData | null;
    isLoading: boolean;

    setSTLData: (data: STLData) => void;
    setLoading: (v: boolean) => void;
    clearSTL: () => void;
}

export const useSTLStore = create<STLState>((set) => ({
    stlData: null,
    isLoading: false,

    setSTLData: (data) => set({ stlData: data }),
    setLoading: (v) => set({ isLoading: v }),
    clearSTL: () => set({ stlData: null }),
}));
