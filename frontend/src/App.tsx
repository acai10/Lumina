import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { Box, CircularProgress, Stack } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from './app/store/viewerSlice'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import AnnotationToolbar from './features/annotation/AnnotationToolbar'
import { useFileLoad } from './features/toolbar/useFileLoad'
import AppSnackbar from './features/notifications/AppSnackbar'
import ControlsPanel from './features/controls/ControlsPanel'
import { FileListPanel } from './features/files/FileListPanel'
import { EmptyState } from './features/onboarding'
import { palette } from './shared/theme/palette'

// Heavy, conditionally-mounted views are code-split so Three.js (~520 KB) and the
// stitcher only load once the user actually opens the corresponding view.
const STLViewer = lazy(() => import('./features/stl/STLViewer'))
const H5Viewer = lazy(() => import('./features/h5/H5Viewer'))
const H5SliceViewer = lazy(() => import('./features/h5/H5SliceViewer'))
const StitcherPanel = lazy(() =>
    import('./features/stitcher').then((m) => ({ default: m.StitcherPanel })),
)

const sceneSpinner = (
    <Box
        sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}
    >
        <CircularProgress size={28} />
    </Box>
)

export default function App() {
    const { tabs, activeTabIndex, stlOverlayIndex, stitchPanelOpen, fileListPanelOpen } =
        useViewerStore(
            useShallow((s) => ({
                tabs: s.tabs,
                activeTabIndex: s.activeTabIndex,
                stlOverlayIndex: s.stlOverlayIndex,
                stitchPanelOpen: s.stitchPanelOpen,
                fileListPanelOpen: s.fileListPanelOpen,
            })),
        )
    // Subscribe to only the active file's per-file state, not the whole map, so a
    // background-tab update or a paint stroke doesn't re-render the whole app tree.
    const activeH5PerState = useViewerStore((s) => {
        const t = s.tabs[s.activeTabIndex]
        return t?.type === 'h5' ? s.h5PerFileStates[t.name] : undefined
    })
    const setNotification = useViewerStore((s) => s.setNotification)
    const ensureHydrated = useViewerStore((s) => s.ensureHydrated)
    const {
        loaders: { loadDroppedFiles },
    } = useFileLoad()
    const [dragActive, setDragActive] = useState(false)

    const activeTab = tabs[activeTabIndex]
    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null
    const hasFiles = tabs.length > 0

    // When the active H5 tab's buffers have been evicted to IndexedDB, pull them
    // back before rendering its viewer.
    const activeH5Name = activeH5?.name
    const activeH5Hydrated = activeH5?.data !== null && activeH5?.data !== undefined
    useEffect(() => {
        if (activeH5Name && !activeH5Hydrated) void ensureHydrated(activeH5Name)
    }, [activeH5Name, activeH5Hydrated, ensureHydrated])

    // Bind once so the `type` discriminant narrows the union — no cast needed.
    const overlayTab = stlOverlayIndex !== null ? tabs[stlOverlayIndex] : undefined
    const stlOverlayTab = overlayTab?.type === 'stl' ? overlayTab : null

    const activeViewMode = activeH5 ? (activeH5PerState?.viewMode ?? 'pointcloud') : 'pointcloud'

    // When the user has toggled comparison mode, render the pre-filter snapshot
    // instead of the current (filtered) data so they can see the before/after diff.
    const renderData =
        activeH5PerState?.showingComparison && activeH5PerState.filterSnapshot
            ? activeH5PerState.filterSnapshot
            : activeH5?.data

    const handleViewerError = useCallback(
        (msg: string) => setNotification({ message: msg, severity: 'error' }),
        [setNotification],
    )

    // App-wide drag-and-drop onto the scene pane (when a file is already loaded;
    // the EmptyState handles drops itself when nothing is loaded).
    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        setDragActive(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) loadDroppedFiles(files)
    }

    return (
        <Stack sx={{ height: '100vh', background: palette.bgAppGradient }}>
            <Toolbar />
            {hasFiles && <H5FileTabs />}
            <Stack direction="row" sx={{ flex: 1, overflow: 'hidden' }}>
                {fileListPanelOpen && <FileListPanel />}
                <ControlsPanel />
                {/* Dedicated central viewer window — black for high model contrast. */}
                <Box
                    onDragOver={
                        hasFiles
                            ? (e) => {
                                  e.preventDefault()
                                  setDragActive(true)
                              }
                            : undefined
                    }
                    onDragLeave={hasFiles ? () => setDragActive(false) : undefined}
                    onDrop={hasFiles ? handleDrop : undefined}
                    sx={{
                        flex: 1,
                        overflow: 'hidden',
                        position: 'relative',
                        background: palette.sceneBg,
                        outline: dragActive ? `2px dashed ${palette.primary}` : 'none',
                        outlineOffset: -8,
                    }}
                >
                    {!hasFiles && <EmptyState />}

                    <Suspense fallback={sceneSpinner}>
                        {/* STL tab — standalone viewer */}
                        {activeStl && (
                            <STLViewer file={activeStl.file} onError={handleViewerError} />
                        )}

                        {/* Active H5 tab whose buffers are still being restored from IndexedDB */}
                        {activeH5 && !activeH5.data && sceneSpinner}

                        {/* H5 point-cloud view (optionally with STL overlay in same scene) */}
                        {activeH5 && renderData && activeViewMode === 'pointcloud' && (
                            <H5Viewer
                                vIndices={renderData.vIndices}
                                vIntensities={renderData.vIntensities}
                                meta={activeH5.meta}
                                fileKey={activeH5.name}
                                stlOverlayFile={stlOverlayTab?.file}
                                stlOverlayName={stlOverlayTab?.name}
                            />
                        )}

                        {/* H5 2-D slice view */}
                        {activeH5 &&
                            renderData &&
                            activeViewMode === 'slice' &&
                            renderData.normalizedVolume && (
                                <H5SliceViewer
                                    normalizedVolume={renderData.normalizedVolume}
                                    meta={activeH5.meta}
                                    fileKey={activeH5.name}
                                />
                            )}
                    </Suspense>

                    {/* Annotation toolbar — painting is 2D-only, so only over the slice view */}
                    {activeH5 && renderData && activeViewMode === 'slice' && (
                        <AnnotationToolbar activeH5={activeH5} />
                    )}
                </Box>
                {stitchPanelOpen && (
                    <Suspense fallback={null}>
                        <StitcherPanel />
                    </Suspense>
                )}
            </Stack>
            <AppSnackbar />
        </Stack>
    )
}
