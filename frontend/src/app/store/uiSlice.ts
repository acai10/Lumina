import { create } from 'zustand';

interface UIState {
    windowLevel: number;
    windowWidth: number;

    setWindowLevel: (v: number) => void;
    setWindowWidth: (v: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
    windowLevel: 128,
    windowWidth: 256,

    setWindowLevel: (v) => set({ windowLevel: v }),
    setWindowWidth: (v) => set({ windowWidth: v }),
}));
