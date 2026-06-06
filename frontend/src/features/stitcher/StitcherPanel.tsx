import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'
import { cleanupUploads, registerLocalVolume } from '../../shared/api'
import { REGISTRATION_METHOD } from '../../shared/api/types'
import type { LocalVolume, RegistrationMethod } from '../../shared/api'
import { ServerVolumeDialog, useServerVolumes } from '../../shared/components'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useStitchSession, type VolumeConfig, type StitchPhase } from './useStitchSession'
import { StitchResults } from './StitchResults'
import { gridTextFieldSx, subLabelSx, tealOutlineButtonSx } from './StitcherPanel.styles'
import { STITCHER_WIDTH } from '../../shared/theme/layout'

const PANEL_WIDTH = STITCHER_WIDTH
const MIN_STITCH_VOLUMES = 2

function inferGridPos(filename: string): { row: number; col: number } {
    const m = filename.match(/_(\d+)_(\d+)(?:\.\w+)?$/)
    if (m) return { row: parseInt(m[1]) - 1, col: parseInt(m[2]) - 1 }
    return { row: 0, col: 0 }
}

const METHOD_LABELS: Record<RegistrationMethod, string> = {
    phase_correlation: 'Phase Correlation',
    cross_correlation: 'Cross Correlation',
    icp: 'ICP (Point Cloud)',
}

const isRegistrationMethod = (v: unknown): v is RegistrationMethod =>
    typeof v === 'string' && v in METHOD_LABELS

const PHASE_LABELS: Record<StitchPhase, string> = {
    idle: '',
    uploading: 'Uploading volumes…',
    processing: 'Registering & stitching…',
    downloading: 'Loading result…',
    done: 'Done',
    error: 'Error',
}

export default function StitcherPanel() {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [configs, setConfigs] = useState<VolumeConfig[]>([])
    const [method, setMethod] = useState<RegistrationMethod>(REGISTRATION_METHOD.PHASE_CORRELATION)
    const [serverDialogOpen, setServerDialogOpen] = useState(false)
    const { phase, sessionStatus, error, run, reset } = useStitchSession()
    const {
        volumes: serverVolumes,
        loading: serverVolumesLoading,
        error: serverVolumesError,
        refresh: refreshServerVolumes,
    } = useServerVolumes()
    const setNotification = useViewerStore((s) => s.setNotification)

    const addConfigs = (entries: VolumeConfig[]) => {
        setConfigs((prev) => {
            const existing = new Set(prev.map((c) => c.name))
            return [...prev, ...entries.filter((e) => !existing.has(e.name))]
        })
    }

    const handleFiles = (files: FileList | null) => {
        if (!files) return
        const newEntries: VolumeConfig[] = Array.from(files)
            .filter((f) => f.name.toLowerCase().endsWith('.h5'))
            .map((f) => ({ name: f.name, file: f, ...inferGridPos(f.name) }))
        addConfigs(newEntries)
    }

    const handleServerOpen = () => {
        setServerDialogOpen(true)
        refreshServerVolumes()
    }

    const handleServerPick = async (local: LocalVolume) => {
        try {
            // Register by path (zero-copy symlink) — no upload — and add to the grid.
            const { volume_id } = await registerLocalVolume(local.path)
            addConfigs([{ name: local.name, volumeId: volume_id, ...inferGridPos(local.name) }])
        } catch (err) {
            setNotification({
                message: `Failed to add "${local.name}": ${err instanceof Error ? err.message : String(err)}`,
                severity: 'error',
            })
        }
    }

    const updateConfig = (idx: number, patch: Partial<VolumeConfig>) => {
        setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
    }

    const removeConfig = (idx: number) => {
        setConfigs((prev) => prev.filter((_, i) => i !== idx))
    }

    const handleReset = () => {
        setConfigs([])
        reset()
        cleanupUploads().catch(() => {
            /* ignore cleanup errors — uploads folder may already be empty */
        })
    }

    const isBusy = phase === 'uploading' || phase === 'processing' || phase === 'downloading'
    const canRun = configs.length >= MIN_STITCH_VOLUMES && !isBusy

    return (
        <Box
            sx={{
                width: PANEL_WIDTH,
                height: '100%',
                overflowY: 'auto',
                background: palette.surfaceGlass,
                backdropFilter: 'blur(12px)',
                borderLeft: `1px solid ${palette.borderGlass}`,
                boxShadow: `inset 1px 0 0 ${palette.glassHighlight}`,
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography
                    variant="subtitle2"
                    sx={{
                        color: palette.textSecondary,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontSize: '0.72rem',
                    }}
                >
                    Volume Stitching
                </Typography>
                {(configs.length > 0 || phase !== 'idle') && (
                    <Button
                        size="small"
                        variant="text"
                        onClick={handleReset}
                        sx={{ color: palette.danger, fontSize: '0.72rem', minWidth: 0 }}
                    >
                        Clear
                    </Button>
                )}
            </Stack>

            {/* File upload */}
            <Box>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".h5"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        handleFiles(e.target.files)
                        e.target.value = ''
                    }}
                />
                <input
                    ref={folderInputRef}
                    type="file"
                    accept=".h5"
                    {...{ webkitdirectory: '' }}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        handleFiles(e.target.files)
                        e.target.value = ''
                    }}
                />
                <Stack direction="row" spacing={1}>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        Add Files
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        Add Folder
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={handleServerOpen}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        From Server
                    </Button>
                </Stack>
            </Box>

            {/* Volume list */}
            {configs.length > 0 && (
                <Box>
                    <Typography variant="caption" sx={subLabelSx}>
                        Volumes — set grid position (row, col)
                    </Typography>
                    <Stack spacing={0.75}>
                        {configs.map((cfg, i) => (
                            <Stack key={cfg.name} direction="row" alignItems="center" spacing={1}>
                                <Tooltip title={cfg.name} placement="top">
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            flex: 1,
                                            color: palette.textMuted,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: '0.72rem',
                                        }}
                                    >
                                        {cfg.name}
                                    </Typography>
                                </Tooltip>
                                <TextField
                                    size="small"
                                    label="Row"
                                    type="number"
                                    value={cfg.row}
                                    onChange={(e) =>
                                        updateConfig(i, { row: parseInt(e.target.value) || 0 })
                                    }
                                    disabled={isBusy}
                                    inputProps={{ min: 0 }}
                                    sx={gridTextFieldSx}
                                />
                                <TextField
                                    size="small"
                                    label="Col"
                                    type="number"
                                    value={cfg.col}
                                    onChange={(e) =>
                                        updateConfig(i, { col: parseInt(e.target.value) || 0 })
                                    }
                                    disabled={isBusy}
                                    inputProps={{ min: 0 }}
                                    sx={gridTextFieldSx}
                                />
                                <IconButton
                                    size="small"
                                    onClick={() => removeConfig(i)}
                                    disabled={isBusy}
                                    sx={{ color: palette.danger, p: 0.25 }}
                                >
                                    ✕
                                </IconButton>
                            </Stack>
                        ))}
                    </Stack>
                </Box>
            )}

            {/* Method selector */}
            <Box>
                <Typography
                    variant="caption"
                    sx={{ color: palette.textMuted, mb: 0.5, display: 'block' }}
                >
                    Registration method
                </Typography>
                <Select
                    size="small"
                    value={method}
                    onChange={(e) => {
                        const v = e.target.value
                        if (isRegistrationMethod(v)) setMethod(v)
                    }}
                    disabled={isBusy}
                    fullWidth
                    sx={{
                        color: palette.textPrimary,
                        fontSize: '0.82rem',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.borderGlass },
                        '& .MuiSvgIcon-root': { color: palette.textMuted },
                    }}
                >
                    {(Object.keys(METHOD_LABELS) as RegistrationMethod[]).map((m) => (
                        <MenuItem key={m} value={m} sx={{ fontSize: '0.82rem' }}>
                            {METHOD_LABELS[m]}
                        </MenuItem>
                    ))}
                </Select>
            </Box>

            {/* Run button */}
            <Button
                variant="outlined"
                size="small"
                fullWidth
                disabled={!canRun}
                onClick={() => run(configs, method)}
                sx={{ borderColor: palette.borderGlass, color: palette.primary }}
            >
                {isBusy ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={14} sx={{ color: palette.primary }} />
                        <span>{PHASE_LABELS[phase]}</span>
                    </Stack>
                ) : (
                    'Run Stitching'
                )}
            </Button>

            {/* Error */}
            {error && (
                <Typography variant="caption" sx={{ color: palette.danger }}>
                    {error}
                </Typography>
            )}

            {/* Results */}
            {sessionStatus?.status === 'done' && <StitchResults status={sessionStatus} />}

            <ServerVolumeDialog
                open={serverDialogOpen}
                volumes={serverVolumes}
                loading={serverVolumesLoading}
                error={serverVolumesError}
                onClose={() => setServerDialogOpen(false)}
                onPick={handleServerPick}
                multiple
            />
        </Box>
    )
}
