import { useCallback, useEffect } from 'react'
import { Box, CircularProgress, Stack } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5SliceViewer from './features/h5/H5SliceViewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import AppSnackbar from './features/notifications/AppSnackbar'
import ControlsPanel from './features/controls/ControlsPanel'
import { StitcherPanel } from './features/stitcher'
import { palette } from './shared/theme/palette'
import type { StlTabEntry } from './shared/types/viewer.types'

export default function App() {
    const { tabs, activeTabIndex, h5PerFileStates, stlOverlayIndex, stitchPanelOpen } =
        useViewerStore(
            useShallow((s) => ({
                tabs: s.tabs,
                activeTabIndex: s.activeTabIndex,
                h5PerFileStates: s.h5PerFileStates,
                stlOverlayIndex: s.stlOverlayIndex,
                stitchPanelOpen: s.stitchPanelOpen,
            })),
        )
    const setNotification = useViewerStore((s) => s.setNotification)
    const ensureHydrated = useViewerStore((s) => s.ensureHydrated)

    const activeTab = tabs[activeTabIndex]
    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null

    // When the active H5 tab's buffers have been evicted to IndexedDB, pull them
    // back before rendering its viewer.
    const activeH5Name = activeH5?.name
    const activeH5Hydrated = activeH5?.data !== null && activeH5?.data !== undefined
    useEffect(() => {
        if (activeH5Name && !activeH5Hydrated) void ensureHydrated(activeH5Name)
    }, [activeH5Name, activeH5Hydrated, ensureHydrated])

    const stlOverlayTab =
        stlOverlayIndex !== null && tabs[stlOverlayIndex]?.type === 'stl'
            ? (tabs[stlOverlayIndex] as StlTabEntry)
            : null

    const activeViewMode = activeH5
        ? (h5PerFileStates[activeH5.name]?.viewMode ?? 'pointcloud')
        : 'pointcloud'

    const handleViewerError = useCallback(
        (msg: string) => setNotification({ message: msg, severity: 'error' }),
        [setNotification],
    )

    return (
        <Stack sx={{ height: '100vh', background: palette.bgDeep }}>
            <Toolbar />
            {tabs.length > 0 && <H5FileTabs />}
            <Stack direction="row" sx={{ flex: 1, overflow: 'hidden' }}>
                <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <ControlsPanel />

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
                    {activeH5 && activeH5.data && activeViewMode === 'pointcloud' && (
                        <H5Viewer
                            vIndices={activeH5.data.vIndices}
                            vIntensities={activeH5.data.vIntensities}
                            meta={activeH5.meta}
                            fileKey={activeH5.name}
                            stlOverlayFile={stlOverlayTab?.file}
                            onError={handleViewerError}
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
                </Box>
                {stitchPanelOpen && <StitcherPanel />}
            </Stack>
            <AppSnackbar />
        </Stack>
    )
}
