import { create } from 'zustand'
import type { H5Meta } from '../../shared/types/viewer.types'

interface ViewerState {
    mode: 'none' | 'stl' | 'h5'
    h5Meta: H5Meta | null
    currentSliceIndex: number | null
    isLoading: boolean
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setH5Meta: (meta: H5Meta) => void
    setCurrentSliceIndex: (index: number | null) => void
    setIsLoading: (loading: boolean) => void
    reset: () => void
}

const initialState = {
    mode: 'none' as const,
    h5Meta: null,
    currentSliceIndex: null,
    isLoading: false,
}

export const useViewerStore = create<ViewerState>((set) => ({
    ...initialState,
    setMode: (mode) => set({ mode }),
    setH5Meta: (h5Meta) => set({ h5Meta }),
    setCurrentSliceIndex: (currentSliceIndex) => set({ currentSliceIndex }),
    setIsLoading: (isLoading) => set({ isLoading }),
    reset: () => set(initialState),
}))
