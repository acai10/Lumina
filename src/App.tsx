import { useCallback } from 'react'
import { Box, Stack } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import AppSnackbar from './features/notifications/AppSnackbar'
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
                {mode === 'stl' && stlFile && (
                    <STLViewer file={stlFile} onError={handleViewerError} />
                )}
                {mode === 'h5' && activeH5 && (
                    <H5Viewer
                        slices={activeH5.data.slices}
                        sliceMinMax={activeH5.data.sliceMinMax}
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
