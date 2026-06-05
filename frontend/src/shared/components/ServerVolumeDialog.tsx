import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Typography from '@mui/material/Typography'
import type { LocalVolume } from '../api'

interface ServerVolumeDialogProps {
    open: boolean
    volumes: LocalVolume[]
    loading: boolean
    error: string | null
    onClose: () => void
    onPick: (local: LocalVolume) => void
    /** When true, allow selecting several files and confirm with an "Add" button. */
    multiple?: boolean
}

/**
 * Presentational list of `.h5` files available on the server (under its `data_dir`).
 * Picking registers them by path — no upload — via the parent's `onPick`.
 * Fetching/state is owned by `useServerVolumes`.
 *
 * - Single mode (default): clicking a row picks it and closes.
 * - Multiple mode: checkboxes + "Add (n)" button; `onPick` is called once per selection.
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
    const [selected, setSelected] = useState<Set<string>>(new Set())

    const toggle = (path: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
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

    const pickSingle = (local: LocalVolume) => {
        onPick(local)
        close()
    }

    const hasList = !loading && !error && volumes.length > 0

    return (
        <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
            <DialogTitle sx={{ fontSize: '0.85rem' }}>Load volume from server</DialogTitle>
            <DialogContent dividers>
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                        <CircularProgress size={20} />
                    </Box>
                )}
                {!loading && error && (
                    <Typography color="error" sx={{ fontSize: '0.7rem' }}>
                        {error}
                    </Typography>
                )}
                {!loading && !error && volumes.length === 0 && (
                    <Typography sx={{ fontSize: '0.7rem', opacity: 0.7 }}>
                        No .h5 files found under the server data directory.
                    </Typography>
                )}
                {hasList && (
                    <List dense>
                        {volumes.map((v) =>
                            multiple ? (
                                <ListItemButton key={v.path} onClick={() => toggle(v.path)} dense>
                                    <Checkbox
                                        edge="start"
                                        size="small"
                                        checked={selected.has(v.path)}
                                        tabIndex={-1}
                                        disableRipple
                                    />
                                    <ListItemText
                                        primary={v.name}
                                        secondary={v.path !== v.name ? v.path : undefined}
                                        slotProps={{
                                            primary: { fontSize: '0.75rem' },
                                            secondary: { fontSize: '0.65rem' },
                                        }}
                                    />
                                </ListItemButton>
                            ) : (
                                <ListItemButton key={v.path} onClick={() => pickSingle(v)}>
                                    <ListItemText
                                        primary={v.name}
                                        secondary={v.path !== v.name ? v.path : undefined}
                                        slotProps={{
                                            primary: { fontSize: '0.75rem' },
                                            secondary: { fontSize: '0.65rem' },
                                        }}
                                    />
                                </ListItemButton>
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
