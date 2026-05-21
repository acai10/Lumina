import { useState } from 'react'
import { Box, Button, CircularProgress, Menu, MenuItem, Typography } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { glowSx } from '../../app/App.styles'

interface ToolbarProps {
    onLoadSTL: () => void
    onLoadH5: () => void
    onLoadH5Folder: () => void
    onClear: () => void
    activeFileName: string | null
    mode: 'none' | 'stl' | 'h5'
    isLoading: boolean
    errorMsg: string | null
}

export default function Toolbar({
    onLoadSTL,
    onLoadH5,
    onLoadH5Folder,
    onClear,
    activeFileName,
    mode,
    isLoading,
    errorMsg,
}: ToolbarProps) {
    const [h5MenuAnchor, setH5MenuAnchor] = useState<HTMLElement | null>(null)
    const menuItemSx = { fontSize: '0.85rem', color: palette.tealLabel }
    const handleFileLoad = () => { setH5MenuAnchor(null); onLoadH5() }
    const handleFolderLoad = () => { setH5MenuAnchor(null); onLoadH5Folder() }

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
                        sx={{ ...glowSx, borderColor: palette.cyanBorder, color: palette.cyanLabel }}
                        onClick={onLoadSTL}
                    >
                        Load STL
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{ ...glowSx, borderColor: palette.tealBorder, color: palette.tealLabel }}
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
                            onClick={onClear}
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
        </Box>
    )
}
