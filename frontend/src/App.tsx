import { useCallback } from 'react'
import { Box } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import AppSnackbar from './features/notifications/AppSnackbar'
import { palette } from './shared/theme/palette'

export default function App() {
    const { mode, stlFile, h5Files, activeH5Index, h5Meta, setNotification } = useViewerStore()
    const activeH5 = h5Files[activeH5Index]

    const handleViewerError = useCallback(
        (msg: string) => setNotification({ message: msg, severity: 'error' }),
        [setNotification],
    )

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', background: palette.bgDeep }}>
            <Toolbar />
            {mode === 'h5' && h5Files.length > 1 && <H5FileTabs />}
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {mode === 'stl' && stlFile && <STLViewer file={stlFile} onError={handleViewerError} />}
                {mode === 'h5' && activeH5 && h5Meta && (
                    <H5Viewer slices={activeH5.data.slices} meta={h5Meta} fileIndex={activeH5Index} onError={handleViewerError} />
                )}
            </Box>
            <AppSnackbar />
        </Box>
    )
}
