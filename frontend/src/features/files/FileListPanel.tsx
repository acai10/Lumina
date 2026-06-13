import { useEffect, useMemo } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import FolderIcon from '@mui/icons-material/Folder'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import RefreshIcon from '@mui/icons-material/Refresh'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useServerVolumes } from '../../shared/components'
import { useFileLoad } from '../toolbar/useFileLoad'
import { palette } from '../../shared/theme/palette'
import { FILE_LIST_WIDTH, PANEL_PADDING } from '../../shared/theme/layout'
import { eyebrowSx } from '../../shared/theme/uiTokens'
import { groupByFolder } from '../../shared/utils'

const panelSx = {
    flexShrink: 0,
    width: FILE_LIST_WIDTH,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: palette.surfaceGlass,
    backdropFilter: 'blur(12px)',
    borderRight: `1px solid ${palette.borderGlass}`,
    boxShadow: `inset 0 1px 0 ${palette.glassHighlight}`,
}

const iconBtnSx = {
    color: palette.textMuted,
    '&:hover': { color: palette.primary, background: palette.primarySoft },
}

export function FileListPanel() {
    const toggleFileListPanel = useViewerStore((s) => s.toggleFileListPanel)
    const { volumes, loading, error, refresh } = useServerVolumes()
    const {
        loaders: { loadServerVolume },
    } = useFileLoad()

    // Auto-load on mount so the panel is immediately populated when opened.
    useEffect(() => {
        void refresh()
    }, [refresh])

    const groups = useMemo(() => groupByFolder(volumes), [volumes])

    return (
        <Box sx={panelSx}>
            {/* Header */}
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ px: PANEL_PADDING, pt: PANEL_PADDING, pb: 0.5, flexShrink: 0 }}
            >
                <Typography sx={eyebrowSx}>FILES ({volumes.length})</Typography>
                <Stack direction="row" spacing={0}>
                    <Tooltip title="Refresh">
                        <IconButton size="small" onClick={refresh} sx={iconBtnSx}>
                            <RefreshIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Close">
                        <IconButton size="small" onClick={toggleFileListPanel} sx={iconBtnSx}>
                            <ChevronLeftIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>
            <Divider sx={{ borderColor: palette.borderGlass }} />

            {/* File list */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={18} />
                    </Box>
                )}
                {!loading && error && (
                    <Typography color="error" sx={{ fontSize: '0.7rem', p: 1.5 }}>
                        {error}
                    </Typography>
                )}
                {!loading && !error && volumes.length === 0 && (
                    <Typography sx={{ fontSize: '0.7rem', opacity: 0.6, p: 1.5 }}>
                        No .h5 files found.
                    </Typography>
                )}
                {!loading && !error && volumes.length > 0 && (
                    <List dense disablePadding>
                        {groups.map(({ folder, files }) =>
                            folder === null ? (
                                files.map((v) => (
                                    <ListItemButton
                                        key={v.path}
                                        onClick={() => void loadServerVolume(v)}
                                        sx={{ pl: 1.5 }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 24 }}>
                                            <InsertDriveFileIcon
                                                sx={{
                                                    fontSize: '0.9rem',
                                                    color: palette.textMuted,
                                                }}
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={v.name}
                                            slotProps={{
                                                primary: { sx: { fontSize: '0.72rem' } },
                                            }}
                                        />
                                    </ListItemButton>
                                ))
                            ) : (
                                <Box key={folder}>
                                    {/* Folder row with file count */}
                                    <Stack
                                        direction="row"
                                        alignItems="center"
                                        spacing={0.75}
                                        sx={{
                                            px: 1.5,
                                            py: 0.5,
                                            opacity: 0.75,
                                            borderTop: `1px solid ${palette.borderGlass}`,
                                        }}
                                    >
                                        <FolderIcon
                                            sx={{ fontSize: '0.9rem', color: 'warning.main' }}
                                        />
                                        <Typography
                                            sx={{ fontSize: '0.7rem', fontWeight: 500, flex: 1 }}
                                            title={folder}
                                            noWrap
                                        >
                                            {folder}
                                        </Typography>
                                        <Typography
                                            sx={{
                                                fontSize: '0.625rem',
                                                opacity: 0.7,
                                                flexShrink: 0,
                                                background: palette.primarySoft,
                                                borderRadius: 0.75,
                                                px: 0.5,
                                            }}
                                        >
                                            {files.length}
                                        </Typography>
                                    </Stack>
                                    {files.map((v) => (
                                        <ListItemButton
                                            key={v.path}
                                            onClick={() => void loadServerVolume(v)}
                                            sx={{ pl: 3.5 }}
                                        >
                                            <ListItemIcon sx={{ minWidth: 22 }}>
                                                <InsertDriveFileIcon
                                                    sx={{
                                                        fontSize: '0.85rem',
                                                        color: palette.textMuted,
                                                    }}
                                                />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={v.name}
                                                slotProps={{
                                                    primary: { sx: { fontSize: '0.7rem' } },
                                                }}
                                            />
                                        </ListItemButton>
                                    ))}
                                </Box>
                            ),
                        )}
                    </List>
                )}
            </Box>
        </Box>
    )
}
