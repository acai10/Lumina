import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import FolderIcon from '@mui/icons-material/Folder'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { LocalVolume } from '../api'

interface ServerVolumeDialogProps {
    open: boolean
    volumes: LocalVolume[]
    loading: boolean
    error: string | null
    onClose: () => void
    onPick: (local: LocalVolume) => void
    /** When true, allow selecting several files/folders and confirm with an "Add" button. */
    multiple?: boolean
}

interface VolumeGroup {
    folder: string | null // null = root level
    files: LocalVolume[]
}

function groupByFolder(volumes: LocalVolume[]): VolumeGroup[] {
    const map = new Map<string | null, LocalVolume[]>()
    for (const v of volumes) {
        const parts = v.path.split('/')
        const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : null
        const list = map.get(folder) ?? []
        list.push(v)
        map.set(folder, list)
    }
    // Root files first, then folders sorted alphabetically
    const groups: VolumeGroup[] = []
    const root = map.get(null)
    if (root) groups.push({ folder: null, files: root })
    for (const [folder, files] of map) {
        if (folder !== null) groups.push({ folder, files })
    }
    groups.sort((a, b) => {
        if (a.folder === null) return -1
        if (b.folder === null) return 1
        return a.folder.localeCompare(b.folder)
    })
    return groups
}

/**
 * Presentational list of `.h5` files available on the server (under its `data_dir`).
 * Files are grouped by folder. Clicking a folder row picks all files in it.
 * Fetching/state is owned by `useServerVolumes`.
 *
 * - Single mode (default): clicking a file or folder picks it/them and closes.
 * - Multiple mode: checkboxes + "Add (n)" button; `onPick` is called once per file.
 */
export function ServerVolumeDialog({
    open,
    volumes,
    loading,
    error,
    onClose,
    onPick,
    multiple = false,
}: ServerVolumeDialogProps) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set())
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

    const { groups, folderMap } = useMemo(() => {
        const g = groupByFolder(volumes)
        const m = new Map(g.map((group) => [group.folder, group.files]))
        return { groups: g, folderMap: m }
    }, [volumes])

    const filesInFolder = (folder: string) => folderMap.get(folder) ?? []

    const allFolderPaths = (folder: string) => filesInFolder(folder).map((f) => f.path)

    const isFolderFullySelected = (folder: string) => {
        const paths = allFolderPaths(folder)
        return paths.length > 0 && paths.every((p) => selected.has(p))
    }

    const isFolderPartiallySelected = (folder: string) => {
        const paths = allFolderPaths(folder)
        return paths.some((p) => selected.has(p)) && !isFolderFullySelected(folder)
    }

    const toggleFile = (path: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    const toggleFolder = (folder: string) => {
        const paths = allFolderPaths(folder)
        const allSelected = paths.every((p) => selected.has(p))
        setSelected((prev) => {
            const next = new Set(prev)
            if (allSelected) paths.forEach((p) => next.delete(p))
            else paths.forEach((p) => next.add(p))
            return next
        })
    }

    const toggleCollapsed = (folder: string) => {
        setCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has(folder)) next.delete(folder)
            else next.add(folder)
            return next
        })
    }

    const close = () => {
        setSelected(new Set())
        onClose()
    }

    const confirmMultiple = () => {
        volumes.filter((v) => selected.has(v.path)).forEach(onPick)
        close()
    }

    const pickSingleFile = (local: LocalVolume) => {
        onPick(local)
        close()
    }

    const pickFolder = (folder: string) => {
        filesInFolder(folder).forEach(onPick)
        close()
    }

    const hasList = !loading && !error && volumes.length > 0

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle sx={{ fontSize: '0.85rem' }}>Load volume from server</DialogTitle>
            <DialogContent dividers sx={{ p: 0 }}>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                    </Box>
                )}
                {!loading && error && (
                    <Typography color="error" sx={{ fontSize: '0.7rem', p: 2 }}>
                        {error}
                    </Typography>
                )}
                {!loading && !error && volumes.length === 0 && (
                    <Typography sx={{ fontSize: '0.7rem', opacity: 0.7, p: 2 }}>
                        No .h5 files found under the server data directory.
                    </Typography>
                )}
                {hasList && (
                    <List dense disablePadding>
                        {groups.map(({ folder, files }) =>
                            folder === null ? (
                                // Root-level files — no folder grouping
                                files.map((v) =>
                                    multiple ? (
                                        <ListItemButton
                                            key={v.path}
                                            onClick={() => toggleFile(v.path)}
                                            dense
                                            sx={{ pl: 2 }}
                                        >
                                            <Checkbox
                                                edge="start"
                                                size="small"
                                                checked={selected.has(v.path)}
                                                tabIndex={-1}
                                                disableRipple
                                                sx={{ mr: 0.5 }}
                                            />
                                            <ListItemIcon sx={{ minWidth: 28 }}>
                                                <InsertDriveFileIcon sx={{ fontSize: '1rem' }} />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={v.name}
                                                slotProps={{
                                                    primary: { sx: { fontSize: '0.75rem' } },
                                                }}
                                            />
                                        </ListItemButton>
                                    ) : (
                                        <ListItemButton
                                            key={v.path}
                                            onClick={() => pickSingleFile(v)}
                                            sx={{ pl: 2 }}
                                        >
                                            <ListItemIcon sx={{ minWidth: 28 }}>
                                                <InsertDriveFileIcon sx={{ fontSize: '1rem' }} />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={v.name}
                                                slotProps={{
                                                    primary: { sx: { fontSize: '0.75rem' } },
                                                }}
                                            />
                                        </ListItemButton>
                                    ),
                                )
                            ) : (
                                // Grouped folder
                                <Box key={folder}>
                                    {/* Folder header row */}
                                    <ListItemButton
                                        dense
                                        sx={{ pl: 1 }}
                                        onClick={() =>
                                            multiple ? toggleCollapsed(folder) : pickFolder(folder)
                                        }
                                    >
                                        {multiple && (
                                            <Checkbox
                                                edge="start"
                                                size="small"
                                                checked={isFolderFullySelected(folder)}
                                                indeterminate={isFolderPartiallySelected(folder)}
                                                tabIndex={-1}
                                                disableRipple
                                                sx={{ mr: 0.5 }}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleFolder(folder)
                                                }}
                                            />
                                        )}
                                        <ListItemIcon sx={{ minWidth: 28 }}>
                                            <FolderIcon
                                                sx={{ fontSize: '1rem', color: 'warning.main' }}
                                            />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={folder}
                                            secondary={`${files.length} file${files.length !== 1 ? 's' : ''}`}
                                            slotProps={{
                                                primary: {
                                                    sx: { fontSize: '0.75rem', fontWeight: 500 },
                                                },
                                                secondary: { sx: { fontSize: '0.65rem' } },
                                            }}
                                        />
                                        {multiple &&
                                            (collapsed.has(folder) ? (
                                                <ExpandMoreIcon
                                                    sx={{ fontSize: '1rem', opacity: 0.6 }}
                                                />
                                            ) : (
                                                <ExpandLessIcon
                                                    sx={{ fontSize: '1rem', opacity: 0.6 }}
                                                />
                                            ))}
                                    </ListItemButton>

                                    {/* Files within folder — always visible in single, collapsible in multiple */}
                                    <Collapse in={!multiple || !collapsed.has(folder)}>
                                        <List dense disablePadding>
                                            {files.map((v) =>
                                                multiple ? (
                                                    <ListItemButton
                                                        key={v.path}
                                                        onClick={() => toggleFile(v.path)}
                                                        dense
                                                        sx={{ pl: 4 }}
                                                    >
                                                        <Checkbox
                                                            edge="start"
                                                            size="small"
                                                            checked={selected.has(v.path)}
                                                            tabIndex={-1}
                                                            disableRipple
                                                            sx={{ mr: 0.5 }}
                                                        />
                                                        <ListItemIcon sx={{ minWidth: 28 }}>
                                                            <InsertDriveFileIcon
                                                                sx={{ fontSize: '0.9rem' }}
                                                            />
                                                        </ListItemIcon>
                                                        <ListItemText
                                                            primary={v.name}
                                                            slotProps={{
                                                                primary: {
                                                                    sx: { fontSize: '0.72rem' },
                                                                },
                                                            }}
                                                        />
                                                    </ListItemButton>
                                                ) : (
                                                    <ListItemButton
                                                        key={v.path}
                                                        onClick={() => pickSingleFile(v)}
                                                        sx={{ pl: 4 }}
                                                    >
                                                        <ListItemIcon sx={{ minWidth: 28 }}>
                                                            <InsertDriveFileIcon
                                                                sx={{ fontSize: '0.9rem' }}
                                                            />
                                                        </ListItemIcon>
                                                        <ListItemText
                                                            primary={v.name}
                                                            slotProps={{
                                                                primary: {
                                                                    sx: { fontSize: '0.72rem' },
                                                                },
                                                            }}
                                                        />
                                                    </ListItemButton>
                                                ),
                                            )}
                                        </List>
                                    </Collapse>
                                </Box>
                            ),
                        )}
                    </List>
                )}
            </DialogContent>
            {multiple && (
                <DialogActions>
                    <Button onClick={close} size="small" sx={{ fontSize: '0.7rem' }}>
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmMultiple}
                        size="small"
                        disabled={selected.size === 0}
                        sx={{ fontSize: '0.7rem' }}
                    >
                        Add ({selected.size})
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    )
}
