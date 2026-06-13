import { useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { palette } from '../../shared/theme/palette'
import { cleanupUploads, registerLocalVolume, registerLocalVolumesBatch } from '../../shared/api'
import { JOB_STATUS, REGISTRATION_METHOD } from '../../shared/api/types'
import type { LocalVolume, RegistrationMethod } from '../../shared/api'
import { ServerVolumeDialog, useServerVolumes } from '../../shared/components'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useStitchSession, type VolumeConfig, type StitchPhase } from './useStitchSession'
import { StitchResults } from './StitchResults'
import { gridTextFieldSx, subLabelSx, tealOutlineButtonSx } from './StitcherPanel.styles'
import { STITCHER_WIDTH, PANEL_PADDING } from '../../shared/theme/layout'
import { eyebrowSx } from '../../shared/theme/uiTokens'

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
    const toggleStitchPanel = useViewerStore((s) => s.toggleStitchPanel)
    const {
        volumes: serverVolumes,
        loading: serverVolumesLoading,
        error: serverVolumesError,
        refresh: refreshServerVolumes,
    } = useServerVolumes()
    const tabs = useViewerStore((s) => s.tabs)
    const setNotification = useViewerStore((s) => s.setNotification)

    const [loadedMenuAnchor, setLoadedMenuAnchor] = useState<HTMLElement | null>(null)

    // H5 tabs that can be used as stitcher inputs:
    // - sourceFile → will be uploaded fresh (local file, not yet on backend)
    // - registeredVolumeId → zero-copy path reference already on backend
    // - backendVolumeId with registeredVolumeId → stitched result, uses merged .h5
    // Tabs that only have backendVolumeId (old stitched tabs before the fix, or
    // sessions without a merged_volume_id) cannot be added as stitcher inputs.
    const loadableH5Tabs = useMemo(
        () =>
            tabs.filter(
                (t) =>
                    t.type === 'h5' &&
                    (t.sourceFile !== undefined || t.registeredVolumeId !== undefined),
            ),
        [tabs],
    )

    const handleAddFromLoaded = (tabName: string) => {
        setLoadedMenuAnchor(null)
        const tab = tabs.find((t) => t.type === 'h5' && t.name === tabName)
        if (!tab || tab.type !== 'h5') return
        const cfg: VolumeConfig = {
            name: tab.name,
            ...inferGridPos(tab.name),
            ...(tab.registeredVolumeId
                ? { volumeId: tab.registeredVolumeId }
                : { file: tab.sourceFile }),
        }
        addConfigs([cfg])
    }

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

    const handleServerPickMany = async (locals: LocalVolume[]) => {
        if (locals.length === 0) return
        try {
            // One round-trip registers every selected tile (vs N+1 per-file calls).
            const responses = await registerLocalVolumesBatch(locals.map((l) => l.path))
            addConfigs(
                responses.map((r, i) => ({
                    name: locals[i].name,
                    volumeId: r.volume_id,
                    ...inferGridPos(locals[i].name),
                })),
            )
        } catch (err) {
            setNotification({
                message: `Failed to add volumes: ${err instanceof Error ? err.message : String(err)}`,
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
                p: PANEL_PADDING,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography sx={eyebrowSx}>Volume Stitching</Typography>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                    {(configs.length > 0 || phase !== 'idle') && (
                        <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={handleReset}
                            sx={{ fontSize: '0.72rem', minWidth: 0 }}
                        >
                            Clear
                        </Button>
                    )}
                    <Tooltip title="Collapse">
                        <IconButton
                            size="small"
                            onClick={toggleStitchPanel}
                            sx={{
                                color: palette.textMuted,
                                '&:hover': {
                                    color: palette.primary,
                                    background: palette.primarySoft,
                                },
                            }}
                        >
                            <ChevronRightIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
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
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        Add Files
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        Add Folder
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleServerOpen}
                        disabled={isBusy}
                        sx={tealOutlineButtonSx}
                    >
                        From Server
                    </Button>
                    <Tooltip
                        title={
                            loadableH5Tabs.length === 0
                                ? 'No loaded H5 files available'
                                : 'Add loaded H5 file'
                        }
                    >
                        <span>
                            <Button
                                variant="outlined"
                                size="small"
                                disabled={isBusy || loadableH5Tabs.length === 0}
                                onClick={(e) => setLoadedMenuAnchor(e.currentTarget)}
                                sx={tealOutlineButtonSx}
                            >
                                From Loaded
                            </Button>
                        </span>
                    </Tooltip>
                </Stack>
                <Menu
                    anchorEl={loadedMenuAnchor}
                    open={Boolean(loadedMenuAnchor)}
                    onClose={() => setLoadedMenuAnchor(null)}
                >
                    {loadableH5Tabs.map((t) => (
                        <MenuItem
                            key={t.name}
                            onClick={() => handleAddFromLoaded(t.name)}
                            sx={{ fontSize: '0.8rem' }}
                        >
                            {t.name}
                        </MenuItem>
                    ))}
                </Menu>
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
                <Typography variant="caption" sx={subLabelSx}>
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
                    {(Object.keys(METHOD_LABELS) as string[])
                        .filter(isRegistrationMethod)
                        .map((m) => (
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
                sx={tealOutlineButtonSx}
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
            {sessionStatus?.status === JOB_STATUS.DONE && <StitchResults status={sessionStatus} />}

            <ServerVolumeDialog
                open={serverDialogOpen}
                volumes={serverVolumes}
                loading={serverVolumesLoading}
                error={serverVolumesError}
                onClose={() => setServerDialogOpen(false)}
                onPick={handleServerPick}
                onPickMany={handleServerPickMany}
                multiple
            />
        </Box>
    )
}
