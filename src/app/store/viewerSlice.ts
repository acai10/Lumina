import { create } from 'zustand'
import type { H5FileEntry, H5PerFileState } from '../../shared/types/viewer.types'

export interface AppNotification {
    message: string
    severity: 'error' | 'success' | 'info'
}

interface ViewerState {
    mode: 'none' | 'stl' | 'h5'
    stlFile: File | null
    h5Files: H5FileEntry[]
    activeH5Index: number
    h5PerFileStates: Record<string, H5PerFileState>
    currentSliceIndex: number | null
    isLoading: boolean
    notification: AppNotification | null
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setStlFile: (file: File | null) => void
    loadH5: (files: H5FileEntry[]) => void
    selectH5: (index: number) => void
    closeH5: (index: number) => void
    saveH5CameraState: (fileKey: string, cam: Omit<H5PerFileState, 'sliceIndex'>) => void
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
    h5PerFileStates: {} as Record<string, H5PerFileState>,
    currentSliceIndex: null,
    isLoading: false,
    notification: null,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
    ...initialState,
    setMode: (mode) => set({ mode }),
    setStlFile: (stlFile) => set({ stlFile }),
    loadH5: (files) => {
        const { h5Files, h5PerFileStates, currentSliceIndex, activeH5Index } = get()
        const newFiles = files.filter((f) => !h5Files.some((e) => e.name === f.name))
        if (newFiles.length === 0) return
        const savedStates =
            h5Files.length > 0
                ? {
                      ...h5PerFileStates,
                      [h5Files[activeH5Index].name]: {
                          ...h5PerFileStates[h5Files[activeH5Index].name],
                          sliceIndex: currentSliceIndex,
                      },
                  }
                : h5PerFileStates
        const updatedFiles = [...h5Files, ...newFiles]
        const newActiveIndex = h5Files.length
        set({
            h5Files: updatedFiles,
            activeH5Index: newActiveIndex,
            currentSliceIndex: null,
            h5PerFileStates: savedStates,
            mode: 'h5',
        })
    },
    selectH5: (index) => {
        const { h5Files, h5PerFileStates, currentSliceIndex, activeH5Index } = get()
        const entry = h5Files[index]
        if (!entry) return
        set({
            activeH5Index: index,
            currentSliceIndex: h5PerFileStates[entry.name]?.sliceIndex ?? null,
            h5PerFileStates: {
                ...h5PerFileStates,
                [h5Files[activeH5Index].name]: {
                    ...h5PerFileStates[h5Files[activeH5Index].name],
                    sliceIndex: currentSliceIndex,
                },
            },
        })
    },
    closeH5: (index) => {
        const { h5Files, h5PerFileStates, activeH5Index } = get()
        const fileKey = h5Files[index].name
        const newFiles = h5Files.filter((_, i) => i !== index)
        const { [fileKey]: _removed, ...newStates } = h5PerFileStates
        if (newFiles.length === 0) {
            set({
                h5Files: [],
                h5PerFileStates: {},
                mode: 'none',
                currentSliceIndex: null,
                activeH5Index: 0,
            })
            return
        }
        let newActive = activeH5Index
        if (index === activeH5Index) newActive = Math.min(index, newFiles.length - 1)
        else if (index < activeH5Index) newActive = activeH5Index - 1
        set({
            h5Files: newFiles,
            h5PerFileStates: newStates,
            activeH5Index: newActive,
            currentSliceIndex: newStates[newFiles[newActive].name]?.sliceIndex ?? null,
        })
    },
    saveH5CameraState: (fileKey, cam) =>
        set((s) => ({
            h5PerFileStates: {
                ...s.h5PerFileStates,
                [fileKey]: { ...s.h5PerFileStates[fileKey], ...cam },
            },
        })),
    setCurrentSliceIndex: (currentSliceIndex) => set({ currentSliceIndex }),
    setIsLoading: (isLoading) => set({ isLoading }),
    setNotification: (notification) => set({ notification }),
    clearNotification: () => set({ notification: null }),
    reset: () => set(initialState),
}))
