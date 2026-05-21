import { useCallback, useState } from 'react'
import { Box } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import Toolbar from './features/toolbar/Toolbar'
import { useFileUpload } from './features/toolbar/useFileUpload'
import { palette } from './shared/theme/palette'
import type { H5UploadResponse } from './shared/types/viewer.types'

export default function App() {
    const { mode, h5Meta, isLoading, setMode, setH5Meta, setIsLoading, reset } = useViewerStore()

    const [stlFile, setStlFile] = useState<File | null>(null)
    const [h5Data, setH5Data] = useState<H5UploadResponse | null>(null)
    const [activeFileName, setActiveFileName] = useState<string>('')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const { stlInputRef, h5InputRef, handleSTLUpload, handleH5Upload } = useFileUpload({
        setStlFile,
        setH5Data,
        setActiveFileName,
        setErrorMsg,
        setMode,
        setH5Meta,
        setIsLoading,
    })

    const handleClear = () => {
        reset()
        setStlFile(null)
        setH5Data(null)
        setActiveFileName('')
        setErrorMsg(null)
    }

    const handleViewerError = useCallback((msg: string) => setErrorMsg(msg), [])

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                background: palette.bgDeep,
            }}
        >
            <Toolbar
                onLoadSTL={() => stlInputRef.current?.click()}
                onLoadH5={() => h5InputRef.current?.click()}
                onClear={handleClear}
                activeFileName={activeFileName || null}
                mode={mode}
                isLoading={isLoading}
                errorMsg={errorMsg}
            />
            <input
                ref={stlInputRef}
                type="file"
                accept=".stl"
                style={{ display: 'none' }}
                onChange={handleSTLUpload}
            />
            <input
                ref={h5InputRef}
                type="file"
                accept=".h5"
                style={{ display: 'none' }}
                onChange={handleH5Upload}
            />
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {mode === 'stl' && stlFile && (
                    <STLViewer file={stlFile} onError={handleViewerError} />
                )}
                {mode === 'h5' && h5Data && h5Meta && (
                    <H5Viewer slices={h5Data.slices} meta={h5Meta} />
                )}
            </Box>
        </Box>
    )
}
