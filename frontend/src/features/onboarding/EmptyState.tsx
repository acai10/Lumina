import { useState } from 'react'
import type { DragEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useFileLoad } from '../toolbar/useFileLoad'
import { ServerVolumeDialog, useServerVolumes } from '../../shared/components'
import { palette } from '../../shared/theme/palette'

/**
 * Onboarding screen shown in the central viewer pane when no file is loaded.
 * Provides clear calls-to-action and a drag-and-drop target, reusing the same
 * load pipeline as the toolbar via useFileLoad.
 */
export default function EmptyState() {
    const { pickers, loaders } = useFileLoad()
    const { stlInputRef, h5InputRef, handleSTLLoad, handleH5Load } = pickers
    const { loadServerVolume, loadDroppedFiles } = loaders
    const {
        volumes: serverVolumes,
        loading: serverVolumesLoading,
        error: serverVolumesError,
        refresh: refreshServerVolumes,
    } = useServerVolumes()

    const [serverDialogOpen, setServerDialogOpen] = useState(false)
    const [dragActive, setDragActive] = useState(false)

    const onDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) loadDroppedFiles(files)
    }

    return (
        <Box
            onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 3,
            }}
        >
            <input
                ref={h5InputRef}
                type="file"
                accept=".h5"
                multiple
                style={{ display: 'none' }}
                onChange={handleH5Load}
            />
            <input
                ref={stlInputRef}
                type="file"
                accept=".stl"
                multiple
                style={{ display: 'none' }}
                onChange={handleSTLLoad}
            />

            <Stack
                spacing={3}
                alignItems="center"
                sx={{
                    width: 'min(560px, 90%)',
                    px: 5,
                    py: 6,
                    textAlign: 'center',
                    borderRadius: 3,
                    background: palette.surfaceGlass,
                    backdropFilter: 'blur(16px)',
                    border: `1.5px dashed ${dragActive ? palette.primary : palette.borderGlass}`,
                    boxShadow: palette.glassShadow,
                    transition: 'border-color 150ms, transform 150ms',
                    transform: dragActive ? 'scale(1.01)' : 'none',
                }}
            >
                <UploadFileIcon sx={{ fontSize: 48, color: palette.primary }} />
                <Stack spacing={0.75} alignItems="center">
                    <Typography variant="h6" sx={{ color: palette.textPrimary }}>
                        Lumina OCT Viewer
                    </Typography>
                    <Typography variant="body2" sx={{ color: palette.textMuted, maxWidth: 380 }}>
                        Load an OCT volume (.h5) or mesh (.stl) to begin — or drag and drop files
                        anywhere in this window.
                    </Typography>
                </Stack>

                <Stack direction="row" spacing={1.5} flexWrap="wrap" justifyContent="center">
                    <Button
                        variant="contained"
                        startIcon={<UploadFileIcon />}
                        onClick={() => h5InputRef.current?.click()}
                    >
                        Load H5
                    </Button>
                    <Button variant="outlined" onClick={() => stlInputRef.current?.click()}>
                        Load STL
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={() => {
                            setServerDialogOpen(true)
                            refreshServerVolumes()
                        }}
                    >
                        From server…
                    </Button>
                </Stack>
            </Stack>

            <ServerVolumeDialog
                open={serverDialogOpen}
                volumes={serverVolumes}
                loading={serverVolumesLoading}
                error={serverVolumesError}
                onClose={() => setServerDialogOpen(false)}
                onPick={loadServerVolume}
            />
        </Box>
    )
}
