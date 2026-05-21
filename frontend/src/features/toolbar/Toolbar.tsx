import { useState } from 'react'
import { Box, Button, CircularProgress, Menu, MenuItem, Typography } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { glowSx } from '../../app/App.styles'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useFileUpload } from './useFileUpload'

export default function Toolbar() {
    const { mode, isLoading, stlFile, h5Files, activeH5Index, reset } = useViewerStore()
    const {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLUpload,
        handleH5Upload,
        handleH5FolderUpload,
    } = useFileUpload()

    const [h5MenuAnchor, setH5MenuAnchor] = useState<HTMLElement | null>(null)

    const activeFileName =
        mode === 'stl' ? (stlFile?.name ?? '') : (h5Files[activeH5Index]?.name ?? '')

    const menuItemSx = { fontSize: '0.85rem', color: palette.tealLabel }
    const handleFileLoad = () => {
        setH5MenuAnchor(null)
        h5InputRef.current?.click()
    }
    const handleFolderLoad = () => {
        setH5MenuAnchor(null)
        h5FolderInputRef.current?.click()
    }

    return (
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
                multiple
                style={{ display: 'none' }}
                onChange={handleH5Upload}
            />
            <input
                ref={h5FolderInputRef}
                type="file"
                {...{ webkitdirectory: '' }}
                style={{ display: 'none' }}
                onChange={handleH5FolderUpload}
            />

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
                        onClick={(e) => setH5MenuAnchor(e.currentTarget)}
                    >
                        Load H5
                    </Button>
                    <Menu
                        anchorEl={h5MenuAnchor}
                        open={Boolean(h5MenuAnchor)}
                        onClose={() => setH5MenuAnchor(null)}
                        slotProps={{
                            paper: {
                                sx: {
                                    background: palette.toolbarBg,
                                    border: `1px solid ${palette.tealBorder}`,
                                    backdropFilter: 'blur(10px)',
                                },
                            },
                        }}
                    >
                        <MenuItem onClick={handleFileLoad} sx={menuItemSx}>
                            File
                        </MenuItem>
                        <MenuItem onClick={handleFolderLoad} sx={menuItemSx}>
                            Folder
                        </MenuItem>
                    </Menu>
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
                            onClick={reset}
                        >
                            Clear
                        </Button>
                    )}
                </>
            )}

            {activeFileName && (
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
        </Box>
    )
}
