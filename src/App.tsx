import { useCallback } from 'react'
import { Box, Stack } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import AppSnackbar from './features/notifications/AppSnackbar'
import ControlsPanel from './features/controls/ControlsPanel'
import { palette } from './shared/theme/palette'

export default function App() {
    const { mode, stlFile, h5Files, activeH5Index, setNotification } = useViewerStore()
    const activeH5 = h5Files[activeH5Index]

    const handleViewerError = useCallback(
        (msg: string) => setNotification({ message: msg, severity: 'error' }),
        [setNotification],
    )

    return (
        <Stack sx={{ height: '100vh', background: palette.bgDeep }}>
            <Toolbar />
            {mode === 'h5' && <H5FileTabs />}
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <ControlsPanel />
                {mode === 'stl' && stlFile && (
                    <STLViewer file={stlFile} onError={handleViewerError} />
                )}
                {mode === 'h5' && activeH5 && (
                    <H5Viewer
                        vIndices={activeH5.data.vIndices}
                        vIntensities={activeH5.data.vIntensities}
                        meta={activeH5.data}
                        fileKey={activeH5.name}
                        onError={handleViewerError}
                    />
                )}
            </Box>
            <AppSnackbar />
        </Stack>
    )
}
