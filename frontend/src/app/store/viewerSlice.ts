import { create } from 'zustand'
import type { H5Meta, H5FileEntry, H5PerFileState } from '../../shared/types/viewer.types'

export interface AppNotification {
    message: string
    severity: 'error' | 'success' | 'info'
}

interface ViewerState {
    mode: 'none' | 'stl' | 'h5'
    stlFile: File | null
    h5Files: H5FileEntry[]
    activeH5Index: number
    h5Meta: H5Meta | null
    h5PerFileStates: Record<number, H5PerFileState>
    currentSliceIndex: number | null
    isLoading: boolean
    notification: AppNotification | null
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setStlFile: (file: File | null) => void
    loadH5: (files: H5FileEntry[]) => void
    selectH5: (index: number) => void
    setH5Meta: (meta: H5Meta) => void
    saveH5CameraState: (index: number, cam: Omit<H5PerFileState, 'sliceIndex'>) => void
    setCurrentSliceIndex: (index: number | null) => void
    setIsLoading: (loading: boolean) => void
    setNotification: (n: AppNotification) => void
    clearNotification: () => void
    reset: () => void
}

const initialState = {
    mode: 'none' as const,
    stlFile: null,
    h5Files: [] as H5FileEntry[],
    activeH5Index: 0,
    h5Meta: null,
    h5PerFileStates: {} as Record<number, H5PerFileState>,
    currentSliceIndex: null,
    isLoading: false,
    notification: null,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
    ...initialState,
    setMode: (mode) => set({ mode }),
    setStlFile: (stlFile) => set({ stlFile }),
    loadH5: (files) => set({ h5Files: files, activeH5Index: 0, h5Meta: files[0].data, h5PerFileStates: {} }),
    selectH5: (index) => {
        const { h5Files, h5PerFileStates, currentSliceIndex, activeH5Index } = get()
        const entry = h5Files[index]
        if (!entry) return
        set({
            activeH5Index: index,
            h5Meta: entry.data,
            currentSliceIndex: h5PerFileStates[index]?.sliceIndex ?? null,
            h5PerFileStates: {
                ...h5PerFileStates,
                [activeH5Index]: { ...h5PerFileStates[activeH5Index], sliceIndex: currentSliceIndex },
            },
        })
    },
    setH5Meta: (h5Meta) => set({ h5Meta }),
    saveH5CameraState: (index, cam) =>
        set((s) => ({
            h5PerFileStates: {
                ...s.h5PerFileStates,
                [index]: { ...s.h5PerFileStates[index], ...cam },
            },
        })),
    setCurrentSliceIndex: (currentSliceIndex) => set({ currentSliceIndex }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setNotification: (notification) => set({ notification }),
    clearNotification: () => set({ notification: null }),
    reset: () => set(initialState),
}))
