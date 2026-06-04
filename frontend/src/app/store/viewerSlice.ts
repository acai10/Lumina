import { create } from 'zustand'
import type {
    H5FileEntry,
    H5PerFileState,
    H5RenderControls,
    H5TabEntry,
    H5VolumeData,
    SlicePanelControl,
    StlTabEntry,
    TabEntry,
} from '../../shared/types/viewer.types'

export interface AppNotification {
    message: string
    severity: 'error' | 'success' | 'info'
}

export const DEFAULT_STL_OPACITY = 0.55

export const DEFAULT_SLICE_PANEL_CONTROL: SlicePanelControl = { brightness: 1.0, contrast: 1.0 }

const defaultSlicePanelControls = () => ({
    z: { ...DEFAULT_SLICE_PANEL_CONTROL },
    y: { ...DEFAULT_SLICE_PANEL_CONTROL },
    x: { ...DEFAULT_SLICE_PANEL_CONTROL },
})

export const defaultRenderControls: H5RenderControls = {
    volumeSpacing: 200,
    h5Threshold: 0.8,
    h5Opacity: 0.25,
    h5Brightness: 1.0,
    h5Contrast: 1.0,
    h5PointSize: 1.0,
    h5SliceRange: [0, 512],
    h5WidthRange: [0, 250],
    h5HeightRange: [0, 250],
}

interface ViewerState {
    /** Unified ordered list of all loaded files — H5 and STL mixed freely. */
    tabs: TabEntry[]
    activeTabIndex: number
    /**
     * Index into `tabs` of the STL file to overlay on the H5 point-cloud scene.
     * Must point to a tab where `type === 'stl'`. null = no overlay.
     */
    stlOverlayIndex: number | null
    h5PerFileStates: Record<string, H5PerFileState>
    isLoading: boolean
    notification: AppNotification | null
    stlOpacity: number
    stitchPanelOpen: boolean
    // Actions — unified tab management
    toggleStitchPanel: () => void
    loadH5: (entries: H5FileEntry[]) => void
    loadStlFiles: (files: File[]) => void
    selectTab: (index: number) => void
    closeTab: (index: number) => void
    reorderTab: (from: number, to: number) => void
    setStlOverlayIndex: (index: number | null) => void
    // H5 per-file actions
    saveH5CameraState: (
        fileKey: string,
        cam: Pick<H5PerFileState, 'cameraPosition' | 'cameraQuaternion' | 'controlsTarget'>,
    ) => void
    updateActiveRenderState: (patch: Partial<H5RenderControls>) => void
    setNormalizedVolume: (fileKey: string, normalizedVolume: Uint8Array) => void
    applyBackendFilter: (fileKey: string, newData: H5VolumeData) => void
    setFilteringState: (fileKey: string, value: boolean) => void
    setH5ViewMode: (fileKey: string, mode: 'pointcloud' | 'slice') => void
    setH5SliceIndex: (fileKey: string, index: number) => void
    setH5SliceY: (fileKey: string, y: number) => void
    setH5SliceX: (fileKey: string, x: number) => void
    setSlicePanelControl: (
        fileKey: string,
        axis: 'z' | 'y' | 'x',
        patch: Partial<SlicePanelControl>,
    ) => void
    resetSlicePanelControls: (fileKey: string) => void
    // Global actions
    setIsLoading: (v: boolean) => void
    setNotification: (n: AppNotification) => void
    clearNotification: () => void
    setStlOpacity: (v: number) => void
    reset: () => void
}

const initialState = {
    tabs: [] as TabEntry[],
    activeTabIndex: 0,
    stlOverlayIndex: null as number | null,
    h5PerFileStates: {} as Record<string, H5PerFileState>,
    isLoading: false,
    notification: null,
    stlOpacity: DEFAULT_STL_OPACITY,
    stitchPanelOpen: false,
}

export const useViewerStore = create<ViewerState>((set, get) => ({
    ...initialState,

    toggleStitchPanel: () => set((s) => ({ stitchPanelOpen: !s.stitchPanelOpen })),

    loadH5: (entries) => {
        const { tabs, h5PerFileStates } = get()
        const existingNames = new Set(tabs.map((t) => t.name))
        const fresh = entries.filter((e) => !existingNames.has(e.name))
        if (fresh.length === 0) return

        const newTabs: H5TabEntry[] = fresh.map((e) => ({ type: 'h5' as const, ...e }))
        const newActiveIndex = tabs.length // first new entry position

        const newStates = { ...h5PerFileStates }
        fresh.forEach((e) => {
            newStates[e.name] = {
                renderControls: {
                    ...defaultRenderControls,
                    h5SliceRange: [0, e.data.nSlices] as [number, number],
                    h5HeightRange: [0, e.data.height] as [number, number],
                    h5WidthRange: [0, e.data.width] as [number, number],
                },
            }
        })

        set({
            tabs: [...tabs, ...newTabs],
            activeTabIndex: newActiveIndex,
            h5PerFileStates: newStates,
        })
    },

    loadStlFiles: (files) => {
        const { tabs } = get()
        const existingNames = new Set(tabs.map((t) => t.name))
        const fresh = files.filter((f) => !existingNames.has(f.name))
        if (fresh.length === 0) return

        const newTabs: StlTabEntry[] = fresh.map((f) => ({
            type: 'stl' as const,
            name: f.name,
            file: f,
        }))

        set({
            tabs: [...tabs, ...newTabs],
            activeTabIndex: tabs.length, // switch to first new STL tab
        })
    },

    selectTab: (index) => set({ activeTabIndex: index }),

    closeTab: (index) => {
        const { tabs, activeTabIndex, h5PerFileStates, stlOverlayIndex } = get()
        const closing = tabs[index]
        const newTabs = tabs.filter((_, i) => i !== index)

        // Remove H5 per-file state for closed H5 tabs.
        const newStates =
            closing.type === 'h5'
                ? (Object.fromEntries(
                      Object.entries(h5PerFileStates).filter(([k]) => k !== closing.name),
                  ) as typeof h5PerFileStates)
                : h5PerFileStates

        // Keep active index in valid range.
        let newActiveIndex = activeTabIndex
        if (newTabs.length === 0) {
            newActiveIndex = 0
        } else if (index === activeTabIndex) {
            newActiveIndex = Math.min(index, newTabs.length - 1)
        } else if (index < activeTabIndex) {
            newActiveIndex = activeTabIndex - 1
        }

        // Adjust overlay index.
        let newOverlay = stlOverlayIndex
        if (stlOverlayIndex === index) {
            newOverlay = null
        } else if (stlOverlayIndex !== null && index < stlOverlayIndex) {
            newOverlay = stlOverlayIndex - 1
        }

        set({
            tabs: newTabs,
            activeTabIndex: newActiveIndex,
            h5PerFileStates: newStates,
            stlOverlayIndex: newOverlay,
        })
    },

    reorderTab: (from, to) => {
        const { tabs, activeTabIndex, stlOverlayIndex } = get()
        const newTabs = [...tabs]
        const [moved] = newTabs.splice(from, 1)
        newTabs.splice(to, 0, moved)

        // Track where the active tab ended up.
        let newActiveIndex = activeTabIndex
        if (from === activeTabIndex) newActiveIndex = to
        else if (from < activeTabIndex && to >= activeTabIndex) newActiveIndex--
        else if (from > activeTabIndex && to <= activeTabIndex) newActiveIndex++

        // Track where the overlay tab ended up.
        let newOverlay: number | null = stlOverlayIndex
        if (stlOverlayIndex !== null) {
            let o = stlOverlayIndex
            if (from === stlOverlayIndex) o = to
            else if (from < stlOverlayIndex && to >= stlOverlayIndex) o--
            else if (from > stlOverlayIndex && to <= stlOverlayIndex) o++
            newOverlay = o
        }

        set({ tabs: newTabs, activeTabIndex: newActiveIndex, stlOverlayIndex: newOverlay })
    },

    setStlOverlayIndex: (stlOverlayIndex) => set({ stlOverlayIndex }),

    saveH5CameraState: (fileKey, cam) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], ...cam },
            },
        })),

    updateActiveRenderState: (patch) => {
        const { tabs, activeTabIndex, h5PerFileStates } = get()
        const active = tabs[activeTabIndex]
        if (active?.type !== 'h5') return
        const fileKey = active.name
        const current = h5PerFileStates[fileKey] ?? { renderControls: { ...defaultRenderControls } }
        set({
            h5PerFileStates: {
                ...h5PerFileStates,
                [fileKey]: { ...current, renderControls: { ...current.renderControls, ...patch } },
            },
        })
    },

    setNormalizedVolume: (fileKey, normalizedVolume) =>
        set((state) => ({
            tabs: state.tabs.map((t) =>
                t.type === 'h5' && t.name === fileKey
                    ? { ...t, data: { ...t.data, normalizedVolume } }
                    : t,
            ),
        })),

    applyBackendFilter: (fileKey, newData) =>
        set((state) => ({
            tabs: state.tabs.map((t) =>
                t.type === 'h5' && t.name === fileKey ? { ...t, data: newData } : t,
            ),
        })),

    setFilteringState: (fileKey, value) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], isFiltering: value },
            },
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

    setH5SliceY: (fileKey, sliceY) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], sliceY },
            },
        })),

    setH5SliceX: (fileKey, sliceX) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: { ...state.h5PerFileStates[fileKey], sliceX },
            },
        })),

    setSlicePanelControl: (fileKey, axis, patch) =>
        set((state) => {
            const current = state.h5PerFileStates[fileKey]
            const controls = current?.slicePanelControls ?? defaultSlicePanelControls()
            return {
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: {
                        ...current,
                        slicePanelControls: {
                            ...controls,
                            [axis]: { ...controls[axis], ...patch },
                        },
                    },
                },
            }
        }),

    resetSlicePanelControls: (fileKey) =>
        set((state) => ({
            h5PerFileStates: {
                ...state.h5PerFileStates,
                [fileKey]: {
                    ...state.h5PerFileStates[fileKey],
                    slicePanelControls: defaultSlicePanelControls(),
                },
            },
        })),

    setIsLoading: (isLoading) => set({ isLoading }),
    setNotification: (notification) => set({ notification }),
    clearNotification: () => set({ notification: null }),
    setStlOpacity: (stlOpacity) => set({ stlOpacity }),
    reset: () => set(initialState),
}))
