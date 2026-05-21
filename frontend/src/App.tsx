import { useCallback, useState } from 'react'
import { Box } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import H5FileTabs from './features/h5/H5FileTabs'
import Toolbar from './features/toolbar/Toolbar'
import { useFileUpload, type H5FileEntry } from './features/toolbar/useFileUpload'
import { palette } from './shared/theme/palette'

export default function App() {
    const { mode, h5Meta, isLoading, setMode, setH5Meta, setIsLoading, setCurrentSliceIndex, reset } =
        useViewerStore()

    const [stlFile, setStlFile] = useState<File | null>(null)
    const [h5Files, setH5Files] = useState<H5FileEntry[]>([])
    const [activeH5Index, setActiveH5Index] = useState(0)
    const [activeFileName, setActiveFileName] = useState<string>('')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const { stlInputRef, h5InputRef, h5FolderInputRef, handleSTLUpload, handleH5Upload, handleH5FolderUpload } =
        useFileUpload({
            setStlFile,
            setH5Files,
            setActiveFileName,
            setErrorMsg,
            setMode,
            setH5Meta,
            setIsLoading,
            setCurrentSliceIndex,
        })

    const handleClear = () => {
        reset()
        setStlFile(null)
        setH5Files([])
        setActiveH5Index(0)
        setActiveFileName('')
        setErrorMsg(null)
    }

    const handleTabChange = (i: number) => {
        const entry = h5Files[i]
        if (!entry) return
        setActiveH5Index(i)
        setH5Meta({ nSlices: entry.data.nSlices, height: entry.data.height, width: entry.data.width })
        setCurrentSliceIndex(null)
        setActiveFileName(entry.name)
    }

    const handleViewerError = useCallback((msg: string) => setErrorMsg(msg), [])

    const activeH5 = h5Files[activeH5Index]

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', background: palette.bgDeep }}>
            <Toolbar
                onLoadSTL={() => stlInputRef.current?.click()}
                onLoadH5={() => h5InputRef.current?.click()}
                onLoadH5Folder={() => h5FolderInputRef.current?.click()}
                onClear={handleClear}
                activeFileName={activeFileName || null}
                mode={mode}
                isLoading={isLoading}
                errorMsg={errorMsg}
            />
            {mode === 'h5' && h5Files.length > 1 && (
                <H5FileTabs files={h5Files} activeIndex={activeH5Index} onChange={handleTabChange} />
            )}
            <input ref={stlInputRef} type="file" accept=".stl" style={{ display: 'none' }} onChange={handleSTLUpload} />
            <input ref={h5InputRef} type="file" accept=".h5" style={{ display: 'none' }} onChange={handleH5Upload} />
            <input ref={h5FolderInputRef} type="file" {...{ webkitdirectory: '' }} style={{ display: 'none' }} onChange={handleH5FolderUpload} />
            <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {mode === 'stl' && stlFile && <STLViewer file={stlFile} onError={handleViewerError} />}
                {mode === 'h5' && activeH5 && h5Meta && (
                    <H5Viewer slices={activeH5.data.slices} meta={h5Meta} />
                )}
            </Box>
        </Box>
    )
}
