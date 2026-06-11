import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { Box, CircularProgress, Stack } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import {
    useActiveTab,
    useActiveViewMode,
    useHasTabs,
    useStlOverlayTab,
} from './app/store/selectors'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import { useFileLoad } from './features/toolbar/useFileLoad'
import AppSnackbar from './features/notifications/AppSnackbar'
import ControlsPanel from './features/controls/ControlsPanel'
import { EmptyState } from './features/onboarding'
import { palette } from './shared/theme/palette'

// The viewers statically import three.js (~150 KB gz) and the stitcher panel
// is closed by default — none of them are needed for first paint (EmptyState).
// Lazy chunks keep them out of the startup bundle.
const STLViewer = lazy(() => import('./features/stl/STLViewer'))
const H5Viewer = lazy(() => import('./features/h5/H5Viewer'))
const H5SliceViewer = lazy(() => import('./features/h5/H5SliceViewer'))
const StitcherPanel = lazy(() => import('./features/stitcher/StitcherPanel'))

function ViewerFallback() {
    return (
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
}

export default function App() {
    // Narrow subscriptions — subscribing to the whole tabs/h5PerFileStates here
    // re-rendered the entire app tree on every render-control slider tick.
    const activeTab = useActiveTab()
    const stlOverlayTab = useStlOverlayTab()
    const stitchPanelOpen = useViewerStore((s) => s.stitchPanelOpen)
    const hasFiles = useHasTabs()
    const activeViewMode = useActiveViewMode()
    const setNotification = useViewerStore((s) => s.setNotification)
    const ensureHydrated = useViewerStore((s) => s.ensureHydrated)
    const { loadDroppedFiles } = useFileLoad()
    const [dragActive, setDragActive] = useState(false)

    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null

    // When the active H5 tab's buffers have been evicted to IndexedDB, pull them
    // back before rendering its viewer.
    const activeH5Name = activeH5?.name
    const activeH5Hydrated = activeH5?.data !== null && activeH5?.data !== undefined
    useEffect(() => {
        if (activeH5Name && !activeH5Hydrated) void ensureHydrated(activeH5Name)
    }, [activeH5Name, activeH5Hydrated, ensureHydrated])

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

                    <Suspense fallback={<ViewerFallback />}>
                        {/* STL tab — standalone viewer */}
                        {activeStl && (
                            <STLViewer file={activeStl.file} onError={handleViewerError} />
                        )}

                        {/* Active H5 tab whose buffers are still being restored from IndexedDB */}
                        {activeH5 && !activeH5.data && (
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
                        )}

                        {/* H5 point-cloud view (optionally with STL overlay in same scene) */}
                        {activeH5 && activeH5.data && activeViewMode === 'pointcloud' && (
                            <H5Viewer
                                vIndices={activeH5.data.vIndices}
                                vIntensities={activeH5.data.vIntensities}
                                meta={activeH5.meta}
                                fileKey={activeH5.name}
                                stlOverlayFile={stlOverlayTab?.file}
                            />
                        )}

                        {/* H5 2-D slice view */}
                        {activeH5 &&
                            activeH5.data &&
                            activeViewMode === 'slice' &&
                            activeH5.data.normalizedVolume && (
                                <H5SliceViewer
                                    normalizedVolume={activeH5.data.normalizedVolume}
                                    meta={activeH5.meta}
                                    fileKey={activeH5.name}
                                />
                            )}
                    </Suspense>
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
