import { create } from 'zustand'
import { putVolume, getVolume, deleteVolume, clearVolumes } from '../../shared/h5'
import { VOLUME_DIMS } from '../../shared/h5/h5Constants'
import type {
    ColormapType,
    H5FileEntry,
    H5Meta,
    H5PerFileState,
    H5RenderControls,
    H5TabEntry,
    H5VolumeData,
    CropBox,
    ObjectLabeling,
    PipelineStep,
    SlicePanelControl,
    StlTabEntry,
    TabEntry,
} from '../../shared/types/viewer.types'

/** Crop box covering the whole volume (the default selection). */
export const fullVolumeCropBox = (meta: {
    nSlices: number
    height: number
    width: number
}): CropBox => ({ x: 0, y: 0, z: 0, w: meta.width, h: meta.height, d: meta.nSlices })

interface AppNotification {
    message: string
    severity: 'error' | 'success' | 'info'
}

/**
 * Maximum number of H5 volumes whose heavy buffers stay on the JS heap at once.
 * Everything else is evicted to IndexedDB (shared/h5/volumeCache) and rehydrated
 * on demand. Two keeps the active tab plus one recently-viewed neighbour resident
 * for snappy A/B switching while bounding peak memory to ~3 volumes during loads.
 */
const MAX_HYDRATED_FILES = 2

// `persisted` tracks which volumes are known to be safely written to IndexedDB,
// so eviction can drop their in-memory buffers without re-writing. A filter result
// removes its key (the buffers changed) until the re-write completes.
// `inFlight` dedupes concurrent rehydration requests for the same key.
const persisted = new Set<string>()
const inFlight = new Set<string>()
// `residentOnly` holds volumes too large to mirror into IndexedDB (e.g. a 25-tile
// stitched montage). Copying multi-GB buffers through structured-clone into IDB is
// slow and can blow the storage quota, so these stay on the JS heap and are never
// evicted. With MAX_HYDRATED_FILES small and such volumes rare, this is safe.
const residentOnly = new Set<string>()

/**
 * Total heavy-buffer size of a volume in bytes. Above PERSIST_MAX_BYTES a volume
 * is kept resident-only (see `residentOnly`) instead of mirrored to IndexedDB.
 * A single OCT tile is ~150–210 MB; the threshold sits comfortably above that so
 * only genuinely oversized (stitched) volumes opt out of persistence.
 */
const PERSIST_MAX_BYTES = 512 * 1024 * 1024

const volumeBytes = (data: H5VolumeData): number =>
    data.vIndices.byteLength +
    data.vIntensities.byteLength +
    (data.normalizedVolume?.byteLength ?? 0)

/** Persist a volume to IndexedDB unless it is oversized; returns true if persisted. */
const persistVolume = async (key: string, data: H5VolumeData): Promise<boolean> => {
    if (volumeBytes(data) > PERSIST_MAX_BYTES) {
        residentOnly.add(key)
        return false
    }
    await putVolume(key, data)
    return true
}

export const DEFAULT_STL_OPACITY = 0.55

export const DEFAULT_SLICE_PANEL_CONTROL: SlicePanelControl = { brightness: 1.0, contrast: 1.0 }

const defaultSlicePanelControls = () => ({
    z: { ...DEFAULT_SLICE_PANEL_CONTROL },
    y: { ...DEFAULT_SLICE_PANEL_CONTROL },
    x: { ...DEFAULT_SLICE_PANEL_CONTROL },
})

const [VOLUME_N_SLICES, VOLUME_HEIGHT, VOLUME_WIDTH] = VOLUME_DIMS

export const defaultRenderControls: H5RenderControls = {
    volumeSpacing: 250,
    h5Threshold: 0.75,
    h5Opacity: 0.25,
    h5Brightness: 5.0,
    h5Contrast: 1.0,
    h5PointSize: 1.0,
    h5SliceRange: [0, VOLUME_N_SLICES],
    h5WidthRange: [0, VOLUME_WIDTH],
    h5HeightRange: [0, VOLUME_HEIGHT],
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
    /** LRU order of H5 file keys by last access; tail = most recently used. */
    hydrationOrder: string[]
    isLoading: boolean
    notification: AppNotification | null
    stlOpacity: number
    stitchPanelOpen: boolean
    controlsPanelOpen: boolean
    fileListPanelOpen: boolean
    zoomToCursor: boolean
    axesVisible: boolean
    /** Monotonic counter for naming confirmed crop tabs ("Crop 1", "Crop 2", …). */
    cropCounter: number
    // Actions — unified tab management
    toggleStitchPanel: () => void
    toggleControlsPanel: () => void
    toggleFileListPanel: () => void
    loadH5: (entries: H5FileEntry[]) => Promise<void>
    /** Restore an evicted tab's buffers from IndexedDB; no-op if already resident. */
    ensureHydrated: (fileKey: string) => Promise<void>
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
    requestCameraReset: (fileKey: string) => void
    updateActiveRenderState: (patch: Partial<H5RenderControls>) => void
    setNormalizedVolume: (fileKey: string, normalizedVolume: Uint8Array) => void
    /** Cache the server-side volume id obtained from a lazy upload of a local file. */
    setBackendVolumeId: (fileKey: string, volumeId: string) => void
    applyBackendFilter: (fileKey: string, newData: H5VolumeData) => void
    saveFilterSnapshot: (fileKey: string) => void
    setFilterApplied: (fileKey: string, value: boolean) => void
    setShowingComparison: (fileKey: string, value: boolean) => void
    setSliceColormap: (fileKey: string, colormap: ColormapType) => void
    setSliceColormapRange: (fileKey: string, range: [number, number]) => void
    setColorByDepth: (fileKey: string, value: boolean) => void
    setSliceVoxelSizeUm: (fileKey: string, size: [number, number, number]) => void
    setMeasurementResult: (fileKey: string, result: H5PerFileState['measurementResult']) => void
    setFilteringState: (fileKey: string, value: boolean) => void
    setH5ViewMode: (fileKey: string, mode: 'pointcloud' | 'slice') => void
    // Crop-selection actions
    setCropMode: (fileKey: string, on: boolean) => void
    setCropBox: (fileKey: string, box: CropBox) => void
    /** Replace this tab's preprocessing pipeline (per-file). */
    setFilterSteps: (fileKey: string, steps: PipelineStep[]) => void
    /** Store (or clear) the object-count labelling used to colour detected objects. */
    setObjectLabeling: (fileKey: string, labeling: ObjectLabeling | null) => void
    /** Toggle whether labelled objects are coloured in the viewers. */
    setObjectColorsVisible: (fileKey: string, value: boolean) => void
    /** Reserve the next sequential crop number for tab naming (e.g. "Crop 3"). */
    nextCropNumber: () => number
    setH5SliceIndex: (fileKey: string, index: number) => void
    setH5SliceY: (fileKey: string, y: number) => void
    setH5SliceX: (fileKey: string, x: number) => void
    setSlicePanelControl: (
        fileKey: string,
        axis: 'z' | 'y' | 'x',
        patch: Partial<SlicePanelControl>,
    ) => void
    resetSlicePanelControls: (fileKey: string) => void
    /**
     * Reset all view/interaction controls for a file to their defaults — render
     * controls, clipping, slice-panel adjustments, slice position, crop selection,
     * voxel spacing and measurement result — and request a camera reset. Filters
     * (pipeline + applied result) and colormap settings are intentionally preserved.
     */
    resetFileControls: (fileKey: string, meta: H5Meta) => void
    // Global actions
    setIsLoading: (v: boolean) => void
    setNotification: (n: AppNotification) => void
    clearNotification: () => void
    setStlOpacity: (v: number) => void
    toggleZoomToCursor: () => void
    toggleAxesVisible: () => void
    reset: () => void
}

const initialState = {
    tabs: [] as TabEntry[],
    activeTabIndex: 0,
    stlOverlayIndex: null as number | null,
    h5PerFileStates: {} as Record<string, H5PerFileState>,
    hydrationOrder: [] as string[],
    isLoading: false,
    notification: null,
    stlOpacity: DEFAULT_STL_OPACITY,
    stitchPanelOpen: false,
    fileListPanelOpen: false,
    controlsPanelOpen: true,
    zoomToCursor: true,
    axesVisible: true,
    cropCounter: 0,
}

export const useViewerStore = create<ViewerState>((set, get) => {
    /** Move `name` to the most-recently-used end of the LRU order. */
    const bumpLru = (name: string) =>
        set((s) => ({ hydrationOrder: [...s.hydrationOrder.filter((n) => n !== name), name] }))

    /**
     * Evict hydrated H5 buffers beyond MAX_HYDRATED_FILES, keeping the active tab
     * and the most-recently-used keys resident. A volume is only dropped from memory
     * once its buffers are confirmed in IndexedDB, so nothing is ever lost.
     */
    const enforceCap = async () => {
        const snapshot = get()
        const snapshotActive = snapshot.tabs[snapshot.activeTabIndex]
        const activeName = snapshotActive?.type === 'h5' ? snapshotActive.name : null
        const keep = new Set(snapshot.hydrationOrder.slice(-MAX_HYDRATED_FILES))
        if (activeName) keep.add(activeName)

        const candidates = snapshot.tabs.filter(
            (t): t is H5TabEntry =>
                t.type === 'h5' &&
                t.data !== null &&
                !keep.has(t.name) &&
                // Oversized volumes are never mirrored to IDB, so they cannot be
                // safely dropped from the heap — keep them resident.
                !residentOnly.has(t.name),
        )

        for (const candidate of candidates) {
            // Re-read live state — the active tab may have changed during an await.
            const cur = get()
            const curActive = cur.tabs[cur.activeTabIndex]
            if (curActive?.type === 'h5' && curActive.name === candidate.name) continue
            const tab = cur.tabs.find(
                (t): t is H5TabEntry => t.type === 'h5' && t.name === candidate.name,
            )
            if (!tab || tab.data === null) continue

            if (!persisted.has(tab.name)) {
                try {
                    if (!(await persistVolume(tab.name, tab.data))) continue // oversized — keep resident
                    persisted.add(tab.name)
                } catch (err) {
                    console.error(
                        `volumeCache: cannot persist "${tab.name}", keeping resident`,
                        err,
                    )
                    continue // never evict what we failed to persist
                }
            }
            set((state) => ({
                tabs: state.tabs.map((t) =>
                    t.type === 'h5' && t.name === tab.name ? { ...t, data: null } : t,
                ),
            }))
        }
    }

    return {
        ...initialState,

        toggleStitchPanel: () => set((s) => ({ stitchPanelOpen: !s.stitchPanelOpen })),
        toggleControlsPanel: () => set((s) => ({ controlsPanelOpen: !s.controlsPanelOpen })),
        toggleFileListPanel: () => set((s) => ({ fileListPanelOpen: !s.fileListPanelOpen })),
        toggleZoomToCursor: () => set((s) => ({ zoomToCursor: !s.zoomToCursor })),
        toggleAxesVisible: () => set((s) => ({ axesVisible: !s.axesVisible })),

        loadH5: async (entries) => {
            const { tabs, h5PerFileStates, hydrationOrder } = get()
            const existingNames = new Set(tabs.map((t) => t.name))
            const fresh = entries.filter((e) => !existingNames.has(e.name))
            if (fresh.length === 0) return

            const newTabs: H5TabEntry[] = fresh.map((e) => ({
                type: 'h5' as const,
                name: e.name,
                meta: { nSlices: e.data.nSlices, height: e.data.height, width: e.data.width },
                data: e.data,
                hasSlices: e.data.normalizedVolume !== null,
                sourceFile: e.sourceFile,
                backendVolumeId: e.backendVolumeId,
                registeredVolumeId: e.registeredVolumeId,
            }))
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
                hydrationOrder: [...hydrationOrder, ...fresh.map((e) => e.name)],
            })

            // Persist freshly loaded buffers so the cap can safely evict older volumes.
            // Oversized volumes are kept resident-only instead (persistVolume returns false).
            for (const e of fresh) {
                try {
                    if (await persistVolume(e.name, e.data)) persisted.add(e.name)
                } catch (err) {
                    console.error(`volumeCache: cannot persist "${e.name}"`, err)
                }
            }
            await enforceCap()
        },

        ensureHydrated: async (fileKey) => {
            const tab = get().tabs.find(
                (t): t is H5TabEntry => t.type === 'h5' && t.name === fileKey,
            )
            if (!tab) return
            if (tab.data !== null) {
                bumpLru(fileKey)
                return
            }
            if (inFlight.has(fileKey)) return
            inFlight.add(fileKey)
            try {
                const data = await getVolume(fileKey)
                if (!data) return
                set((state) => ({
                    tabs: state.tabs.map((t) =>
                        t.type === 'h5' && t.name === fileKey ? { ...t, data } : t,
                    ),
                }))
                bumpLru(fileKey)
                await enforceCap()
            } catch (err) {
                console.error(`volumeCache: cannot rehydrate "${fileKey}"`, err)
            } finally {
                inFlight.delete(fileKey)
            }
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

        selectTab: (index) => {
            set({ activeTabIndex: index })
            const tab = get().tabs[index]
            // Restore the newly-active volume's buffers if they were evicted to IDB.
            if (tab?.type === 'h5') void get().ensureHydrated(tab.name)
        },

        closeTab: (index) => {
            const { tabs, activeTabIndex, h5PerFileStates, stlOverlayIndex, hydrationOrder } = get()
            const closing = tabs[index]
            const newTabs = tabs.filter((_, i) => i !== index)

            // Drop the closed H5 volume's off-heap buffers and bookkeeping.
            let newHydrationOrder = hydrationOrder
            if (closing.type === 'h5') {
                void deleteVolume(closing.name)
                persisted.delete(closing.name)
                residentOnly.delete(closing.name)
                newHydrationOrder = hydrationOrder.filter((n) => n !== closing.name)
            }

            // Remove H5 per-file state for closed H5 tabs.
            const newStates: Record<string, H5PerFileState> =
                closing.type === 'h5'
                    ? Object.fromEntries(
                          Object.entries(h5PerFileStates).filter(([k]) => k !== closing.name),
                      )
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
                hydrationOrder: newHydrationOrder,
            })

            // The tab that became active may have been evicted — bring it back.
            const newActive = newTabs[newActiveIndex]
            if (newActive?.type === 'h5') void get().ensureHydrated(newActive.name)
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

        requestCameraReset: (fileKey) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: {
                        ...state.h5PerFileStates[fileKey],
                        cameraResetGen:
                            ((state.h5PerFileStates[fileKey]?.cameraResetGen ?? 0) + 1) % 1000,
                    },
                },
            })),

        updateActiveRenderState: (patch) => {
            const { tabs, activeTabIndex, h5PerFileStates } = get()
            const active = tabs[activeTabIndex]
            if (active?.type !== 'h5') return
            const fileKey = active.name
            const current = h5PerFileStates[fileKey] ?? {
                renderControls: { ...defaultRenderControls },
            }
            set({
                h5PerFileStates: {
                    ...h5PerFileStates,
                    [fileKey]: {
                        ...current,
                        renderControls: { ...current.renderControls, ...patch },
                    },
                },
            })
        },

        setNormalizedVolume: (fileKey, normalizedVolume) =>
            set((state) => ({
                tabs: state.tabs.map((t) =>
                    t.type === 'h5' && t.name === fileKey && t.data !== null
                        ? { ...t, data: { ...t.data, normalizedVolume }, hasSlices: true }
                        : t,
                ),
            })),

        setBackendVolumeId: (fileKey, volumeId) =>
            set((state) => ({
                tabs: state.tabs.map((t) =>
                    t.type === 'h5' && t.name === fileKey ? { ...t, backendVolumeId: volumeId } : t,
                ),
            })),

        applyBackendFilter: (fileKey, newData) => {
            set((state) => ({
                tabs: state.tabs.map((t) =>
                    t.type === 'h5' && t.name === fileKey
                        ? {
                              ...t,
                              data: newData,
                              meta: {
                                  nSlices: newData.nSlices,
                                  height: newData.height,
                                  width: newData.width,
                              },
                              hasSlices: newData.normalizedVolume !== null,
                          }
                        : t,
                ),
                // The voxels changed — any prior object labelling no longer matches.
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], objectLabeling: null },
                },
            }))
            bumpLru(fileKey)
            // The cached buffers are now stale — mark unpersisted, then re-write so a
            // later eviction restores the *filtered* result rather than the original.
            persisted.delete(fileKey)
            residentOnly.delete(fileKey)
            persistVolume(fileKey, newData)
                .then((ok) => {
                    if (ok) persisted.add(fileKey)
                })
                .catch((err) =>
                    console.error(`volumeCache: cannot persist filtered "${fileKey}"`, err),
                )
        },

        saveFilterSnapshot: (fileKey) => {
            const tab = get().tabs.find(
                (t): t is H5TabEntry => t.type === 'h5' && t.name === fileKey,
            )
            if (!tab?.data) return
            const snapshot = { ...tab.data }
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: {
                        ...state.h5PerFileStates[fileKey],
                        filterSnapshot: snapshot,
                        showingComparison: false,
                    },
                },
            }))
        },

        setFilterApplied: (fileKey, value) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], filterApplied: value },
                },
            })),

        setShowingComparison: (fileKey, value) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], showingComparison: value },
                },
            })),

        setSliceColormap: (fileKey, colormap) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], sliceColormap: colormap },
                },
            })),

        setSliceColormapRange: (fileKey, range) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], sliceColormapRange: range },
                },
            })),

        setColorByDepth: (fileKey, value) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], colorByDepth: value },
                },
            })),

        setSliceVoxelSizeUm: (fileKey, size) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], sliceVoxelSizeUm: size },
                },
            })),

        setMeasurementResult: (fileKey, result) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], measurementResult: result },
                },
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

        setCropMode: (fileKey, cropMode) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], cropMode },
                },
            })),

        setCropBox: (fileKey, cropBox) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], cropBox },
                },
            })),

        setFilterSteps: (fileKey, filterSteps) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], filterSteps },
                },
            })),

        setObjectLabeling: (fileKey, objectLabeling) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: {
                        ...state.h5PerFileStates[fileKey],
                        objectLabeling,
                        // Showing a fresh labelling implies it should be visible.
                        objectColorsVisible: objectLabeling
                            ? true
                            : state.h5PerFileStates[fileKey]?.objectColorsVisible,
                    },
                },
            })),

        setObjectColorsVisible: (fileKey, objectColorsVisible) =>
            set((state) => ({
                h5PerFileStates: {
                    ...state.h5PerFileStates,
                    [fileKey]: { ...state.h5PerFileStates[fileKey], objectColorsVisible },
                },
            })),

        nextCropNumber: () => {
            const next = get().cropCounter + 1
            set({ cropCounter: next })
            return next
        },

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

        resetFileControls: (fileKey, meta) =>
            set((state) => {
                const current = state.h5PerFileStates[fileKey]
                if (!current) return {}
                return {
                    h5PerFileStates: {
                        ...state.h5PerFileStates,
                        [fileKey]: {
                            ...current,
                            renderControls: {
                                ...defaultRenderControls,
                                h5SliceRange: [0, meta.nSlices],
                                h5HeightRange: [0, meta.height],
                                h5WidthRange: [0, meta.width],
                            },
                            slicePanelControls: defaultSlicePanelControls(),
                            sliceIndex: undefined,
                            sliceY: undefined,
                            sliceX: undefined,
                            cropMode: false,
                            cropBox: undefined,
                            sliceVoxelSizeUm: undefined,
                            measurementResult: null,
                            objectLabeling: null,
                            cameraResetGen: ((current.cameraResetGen ?? 0) + 1) % 1000,
                            // Preserved on purpose: sliceColormap, sliceColormapRange,
                            // colorByDepth (colormap) and filterApplied, filterSnapshot,
                            // showingComparison (filters).
                        },
                    },
                }
            }),

        setIsLoading: (isLoading) => set({ isLoading }),
        setNotification: (notification) => set({ notification }),
        clearNotification: () => set({ notification: null }),
        setStlOpacity: (stlOpacity) => set({ stlOpacity }),
        reset: () => {
            void clearVolumes()
            persisted.clear()
            inFlight.clear()
            residentOnly.clear()
            set(initialState)
        },
    }
})
