import React, { useCallback, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { useViewerStore } from './app/store/viewerSlice'
import STLViewer from './features/stl/STLViewer'
import H5Viewer from './features/h5/H5Viewer'
import { uploadH5 } from './shared/api/octAPI'
import { palette } from './shared/theme/palette'
import type { H5UploadResponse } from './shared/types/viewer.types'

const glowSx = {
    px: 3,
    py: 0.75,
    fontSize: '0.9rem',
    letterSpacing: '0.06em',
    borderRadius: '6px',
    textTransform: 'none' as const,
    transition: 'box-shadow 0.2s',
    '&:hover': { boxShadow: `0 0 18px 3px ${palette.cyanGlow}` },
}

export default function App() {
    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)

    const { mode, h5Meta, isLoading, setMode, setH5Meta, setIsLoading, reset } = useViewerStore()

    const [stlFile, setStlFile] = useState<File | null>(null)
    const [h5Data, setH5Data] = useState<H5UploadResponse | null>(null)
    const [activeFileName, setActiveFileName] = useState<string>('')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const handleSTLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setErrorMsg(null)
        setStlFile(file)
        setActiveFileName(file.name)
        setMode('stl')
    }

    const handleH5Change = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setErrorMsg(null)
        setIsLoading(true)
        try {
            const data = await uploadH5(file)
            setH5Data(data)
            setH5Meta({ nSlices: data.nSlices, height: data.height, width: data.width })
            setActiveFileName(file.name)
            setMode('h5')
        } catch (err) {
            console.error('H5 upload failed:', err)
            setErrorMsg(err instanceof Error ? err.message : 'Upload failed.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleClear = () => {
        reset()
        setStlFile(null)
        setH5Data(null)
        setActiveFileName('')
        setErrorMsg(null)
    }

    const handleViewerError = useCallback((msg: string) => {
        setErrorMsg(msg)
    }, [])

    return (
        <Box
            sx={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                background: palette.bgDeep,
            }}
        >
            {/* Toolbar */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    px: 3,
                    py: 1,
                    flexShrink: 0,
                    background: palette.toolbarBg,
                    backdropFilter: 'blur(10px)',
                    borderBottom: `1px solid ${palette.toolbarBorder}`,
                }}
            >
                {isLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CircularProgress size={18} sx={{ color: palette.cyan }} />
                        <Typography sx={{ color: palette.textSecondary, fontSize: '0.85rem' }}>
                            Loading volume…
                        </Typography>
                    </Box>
                ) : (
                    <>
                        <Button
                            variant="outlined"
                            size="small"
                            sx={{
                                ...glowSx,
                                borderColor: palette.cyanBorder,
                                color: palette.cyanLabel,
                            }}
                            onClick={() => stlInputRef.current?.click()}
                        >
                            Load STL
                        </Button>
                        <Button
                            variant="outlined"
                            size="small"
                            sx={{
                                ...glowSx,
                                borderColor: palette.tealBorder,
                                color: palette.tealLabel,
                            }}
                            onClick={() => h5InputRef.current?.click()}
                        >
                            Load H5 Volume
                        </Button>
                        {mode !== 'none' && (
                            <Button
                                variant="outlined"
                                size="small"
                                sx={{
                                    ...glowSx,
                                    borderColor: palette.clearBorder,
                                    color: palette.clearLabel,
                                    '&:hover': { boxShadow: `0 0 18px 3px ${palette.clearGlow}` },
                                }}
                                onClick={handleClear}
                            >
                                Clear
                            </Button>
                        )}
                    </>
                )}

                {errorMsg && (
                    <Typography
                        sx={{
                            ml: 1,
                            color: palette.errorText,
                            fontSize: '0.8rem',
                            maxWidth: 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {errorMsg}
                    </Typography>
                )}

                {!errorMsg && activeFileName && (
                    <Typography
                        sx={{
                            ml: 'auto',
                            color: palette.textMuted,
                            fontSize: '0.8rem',
                            letterSpacing: '0.04em',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: 320,
                        }}
                    >
                        {activeFileName}
                    </Typography>
                )}

                <input
                    ref={stlInputRef}
                    type="file"
                    accept=".stl"
                    style={{ display: 'none' }}
                    onChange={handleSTLChange}
                />
                <input
                    ref={h5InputRef}
                    type="file"
                    accept=".h5"
                    style={{ display: 'none' }}
                    onChange={handleH5Change}
                />
            </Box>

            {/* Workspace */}
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
