import { create } from 'zustand';

type Tool = 'select' | 'zoom' | 'pan';
type Panel = 'windowing' | 'filters' | 'segmentation';

interface UIState {
    activePanel: Panel;
    selectedTool: Tool;
    windowLevel: number;
    windowWidth: number;

    setActivePanel: (p: Panel) => void;
    setSelectedTool: (t: Tool) => void;
    setWindowLevel: (v: number) => void;
    setWindowWidth: (v: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
    activePanel: 'windowing',
    selectedTool: 'select',
    windowLevel: 128,
    windowWidth: 256,

    setActivePanel: (p) => set({ activePanel: p }),
    setSelectedTool: (t) => set({ selectedTool: t }),
    setWindowLevel: (v) => set({ windowLevel: v }),
    setWindowWidth: (v) => set({ windowWidth: v }),
}));
