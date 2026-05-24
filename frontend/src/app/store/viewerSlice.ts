import { create } from 'zustand'
import type {
    H5FileEntry,
    H5PerFileState,
    H5RenderControls,
    H5VolumeData,
} from '../../shared/types/viewer.types'

export interface AppNotification {
    message: string
    severity: 'error' | 'success' | 'info'
}

export const DEFAULT_STL_OPACITY = 0.55

export const defaultRenderControls: H5RenderControls = {
    volumeSpacing: 200,
    h5Threshold: 0.8,
    h5Opacity: 0.25,
    h5Brightness: 3.0,
    h5Contrast: 1.0,
    h5PointSize: 1.0,
    h5SliceRange: [0, 512],
    h5WidthRange: [0, 250],
    h5HeightRange: [0, 250],
}

interface ViewerState {
    mode: 'none' | 'stl' | 'h5'
    stlFile: File | null
    h5Files: H5FileEntry[]
    activeH5Index: number
    h5PerFileStates: Record<string, H5PerFileState>
    isLoading: boolean
    notification: AppNotification | null
    stlOpacity: number
    // Actions
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setStlFile: (file: File | null) => void
    loadH5: (files: H5FileEntry[]) => void
    selectH5: (index: number) => void
    closeH5: (index: number) => void
    reorderH5: (fromIndex: number, toIndex: number) => void
    saveH5CameraState: (
        fileKey: string,
        cam: Pick<H5PerFileState, 'cameraPosition' | 'cameraQuaternion' | 'controlsTarget'>,
    ) => void
    updateActiveRenderState: (patch: Partial<H5RenderControls>) => void
    setIsLoading: (loading: boolean) => void
    setNotification: (n: AppNotification) => void
    clearNotification: () => void
    setStlOpacity: (v: number) => void
    setFilteringState: (fileKey: string, value: boolean) => void
    applyBackendFilter: (fileKey: string, newData: H5VolumeData) => void
    setH5ViewMode: (fileKey: string, mode: 'pointcloud' | 'slice') => void
    setH5SliceIndex: (fileKey: string, index: number) => void
    reset: () => void
}

const initialState = {
    mode: 'none' as const,
    stlFile: null,
    h5Files: [] as H5FileEntry[],
    activeH5Index: 0,
    h5PerFileStates: {} as Record<string, H5PerFileState>,
    isLoading: false,
    notification: null,
    stlOpacity: DEFAULT_STL_OPACITY,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
    ...initialState,
    setMode: (mode) => set({ mode }),
    setStlFile: (stlFile) => set({ stlFile }),
    loadH5: (files) => {
        const { h5Files, h5PerFileStates } = get()
        const newFiles = files.filter((f) => !h5Files.some((e) => e.name === f.name))
        if (newFiles.length === 0) return
        const updatedFiles = [...h5Files, ...newFiles]
        const newActiveIndex = h5Files.length
        const newStates = { ...h5PerFileStates }
        newFiles.forEach((f) => {
            newStates[f.name] = { renderControls: { ...defaultRenderControls } }
        })
        set({
            h5Files: updatedFiles,
            activeH5Index: newActiveIndex,
            mode: 'h5',
            h5PerFileStates: newStates,
        })
    },
    selectH5: (index) => {
        const { h5Files } = get()
        if (!h5Files[index]) return
        set({ activeH5Index: index })
    },
    closeH5: (index) => {
        const { h5Files, h5PerFileStates, activeH5Index } = get()
        const fileKey = h5Files[index].name
        const newFiles = h5Files.filter((_, i) => i !== index)
        const newStates = Object.fromEntries(
            Object.entries(h5PerFileStates).filter(([k]) => k !== fileKey),
        ) as typeof h5PerFileStates
        if (newFiles.length === 0) {
            set({ h5Files: [], h5PerFileStates: {}, mode: 'none', activeH5Index: 0 })
            return
        }
        let newActive = activeH5Index
        if (index === activeH5Index) newActive = Math.min(index, newFiles.length - 1)
        else if (index < activeH5Index) newActive = activeH5Index - 1
        set({ h5Files: newFiles, h5PerFileStates: newStates, activeH5Index: newActive })
    },
    reorderH5: (fromIndex, toIndex) => {
        const { h5Files, activeH5Index } = get()
        const newFiles = [...h5Files]
        const [removed] = newFiles.splice(fromIndex, 1)
        newFiles.splice(toIndex, 0, removed)
        let newActive = activeH5Index
        if (fromIndex === activeH5Index) newActive = toIndex
        else if (fromIndex < activeH5Index && toIndex >= activeH5Index) newActive--
        else if (fromIndex > activeH5Index && toIndex <= activeH5Index) newActive++
        set({ h5Files: newFiles, activeH5Index: newActive })
    },
    saveH5CameraState: (fileKey, cam) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], ...cam },
            },
        })),
    updateActiveRenderState: (patch) => {
        const { h5Files, activeH5Index, h5PerFileStates } = get()
        const fileKey = h5Files[activeH5Index]?.name
        if (!fileKey) return
        const current = h5PerFileStates[fileKey] ?? { renderControls: { ...defaultRenderControls } }
        set({
            h5PerFileStates: {
                ...h5PerFileStates,
                [fileKey]: { ...current, renderControls: { ...current.renderControls, ...patch } },
            },
        })
    },
    setIsLoading: (isLoading) => set({ isLoading }),
    setNotification: (notification) => set({ notification }),
    clearNotification: () => set({ notification: null }),
    setStlOpacity: (stlOpacity) => set({ stlOpacity }),
    setFilteringState: (fileKey, value) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], isFiltering: value },
            },
        })),
    applyBackendFilter: (fileKey, newData) =>
        set((state) => ({
            h5Files: state.h5Files.map((f) => (f.name === fileKey ? { ...f, data: newData } : f)),
        })),
    setH5ViewMode: (fileKey, viewMode) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], viewMode },
            },
        })),
    setH5SliceIndex: (fileKey, sliceIndex) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], sliceIndex },
            },
        })),
    reset: () => set(initialState),
}))
