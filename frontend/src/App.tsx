import { useCallback, useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { Box, CircularProgress, Stack } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5SliceViewer from './features/h5/H5SliceViewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import { useFileLoad } from './features/toolbar/useFileLoad'
import AppSnackbar from './features/notifications/AppSnackbar'
import ControlsPanel from './features/controls/ControlsPanel'
import { FileListPanel } from './features/files/FileListPanel'
import { StitcherPanel } from './features/stitcher'
import { EmptyState } from './features/onboarding'
import { palette } from './shared/theme/palette'

export default function App() {
    const { tabs, activeTabIndex, h5PerFileStates, stlOverlayIndex, stitchPanelOpen, fileListPanelOpen } =
        useViewerStore(
            useShallow((s) => ({
                tabs: s.tabs,
                activeTabIndex: s.activeTabIndex,
                h5PerFileStates: s.h5PerFileStates,
                stlOverlayIndex: s.stlOverlayIndex,
                stitchPanelOpen: s.stitchPanelOpen,
                fileListPanelOpen: s.fileListPanelOpen,
            })),
        )
    const setNotification = useViewerStore((s) => s.setNotification)
    const ensureHydrated = useViewerStore((s) => s.ensureHydrated)
    const { loadDroppedFiles } = useFileLoad()
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

    const activeViewMode = activeH5
        ? (h5PerFileStates[activeH5.name]?.viewMode ?? 'pointcloud')
        : 'pointcloud'

    // When the user has toggled comparison mode, render the pre-filter snapshot
    // instead of the current (filtered) data so they can see the before/after diff.
    const activeH5PerState = activeH5 ? h5PerFileStates[activeH5.name] : undefined
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

                    {/* STL tab — standalone viewer */}
                    {activeStl && <STLViewer file={activeStl.file} onError={handleViewerError} />}

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
                    {activeH5 && renderData && activeViewMode === 'pointcloud' && (
                        <H5Viewer
                            vIndices={renderData.vIndices}
                            vIntensities={renderData.vIntensities}
                            meta={activeH5.meta}
                            fileKey={activeH5.name}
                            stlOverlayFile={stlOverlayTab?.file}
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
                </Box>
                {stitchPanelOpen && <StitcherPanel />}
            </Stack>
            <AppSnackbar />
        </Stack>
    )
}
