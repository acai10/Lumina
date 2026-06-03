import { useRef, useState } from 'react'
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { cleanupUploads } from '../../shared/api'
import type { RegistrationMethod } from '../../shared/api'
import { useStitchSession, type VolumeConfig } from './useStitchSession'

const PANEL_WIDTH = 420

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

const PHASE_LABELS: Record<string, string> = {
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
    const [method, setMethod] = useState<RegistrationMethod>('phase_correlation')
    const { phase, sessionStatus, error, run, reset } = useStitchSession()

    const handleFiles = (files: FileList | null) => {
        if (!files) return
        const newEntries: VolumeConfig[] = Array.from(files)
            .filter((f) => f.name.toLowerCase().endsWith('.h5'))
            .map((f) => ({ file: f, ...inferGridPos(f.name) }))
        setConfigs((prev) => {
            const existing = new Set(prev.map((c) => c.file.name))
            return [...prev, ...newEntries.filter((e) => !existing.has(e.file.name))]
        })
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
    const canRun = configs.length >= 2 && !isBusy

    return (
        <Box
            sx={{
                width: PANEL_WIDTH,
                height: '100%',
                overflowY: 'auto',
                background: palette.panelBg,
                borderLeft: `1px solid ${palette.toolbarBorder}`,
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
                        sx={{ color: palette.clearLabel, fontSize: '0.72rem', minWidth: 0 }}
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
                        sx={{ borderColor: palette.tealBorder, color: palette.tealLabel }}
                    >
                        Add Files
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        onClick={() => folderInputRef.current?.click()}
                        disabled={isBusy}
                        sx={{ borderColor: palette.tealBorder, color: palette.tealLabel }}
                    >
                        Add Folder
                    </Button>
                </Stack>
            </Box>

            {/* Volume list */}
            {configs.length > 0 && (
                <Box>
                    <Typography
                        variant="caption"
                        sx={{ color: palette.textMuted, mb: 0.5, display: 'block' }}
                    >
                        Volumes — set grid position (row, col)
                    </Typography>
                    <Stack spacing={0.75}>
                        {configs.map((cfg, i) => (
                            <Stack
                                key={cfg.file.name}
                                direction="row"
                                alignItems="center"
                                spacing={1}
                            >
                                <Tooltip title={cfg.file.name} placement="top">
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            flex: 1,
                                            color: palette.textDim,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: '0.72rem',
                                        }}
                                    >
                                        {cfg.file.name}
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
                                    sx={{
                                        width: 68,
                                        '& .MuiInputBase-input': {
                                            color: palette.textPrimary,
                                            fontSize: '0.78rem',
                                        },
                                        '& .MuiInputLabel-root': {
                                            color: palette.textMuted,
                                            fontSize: '0.72rem',
                                        },
                                    }}
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
                                    sx={{
                                        width: 68,
                                        '& .MuiInputBase-input': {
                                            color: palette.textPrimary,
                                            fontSize: '0.78rem',
                                        },
                                        '& .MuiInputLabel-root': {
                                            color: palette.textMuted,
                                            fontSize: '0.72rem',
                                        },
                                    }}
                                />
                                <IconButton
                                    size="small"
                                    onClick={() => removeConfig(i)}
                                    disabled={isBusy}
                                    sx={{ color: palette.clearLabel, p: 0.25 }}
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
                    onChange={(e) => setMethod(e.target.value as RegistrationMethod)}
                    disabled={isBusy}
                    fullWidth
                    sx={{
                        color: palette.textPrimary,
                        fontSize: '0.82rem',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.cyanBorder },
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
                sx={{ borderColor: palette.cyanBorder, color: palette.cyanLabel }}
            >
                {isBusy ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={14} sx={{ color: palette.cyan }} />
                        <span>{PHASE_LABELS[phase]}</span>
                    </Stack>
                ) : (
                    'Run Stitching'
                )}
            </Button>

            {/* Error */}
            {error && (
                <Typography variant="caption" sx={{ color: palette.errorText }}>
                    {error}
                </Typography>
            )}

            {/* Results */}
            {sessionStatus?.status === 'done' && (
                <>
                    <Divider sx={{ borderColor: palette.toolbarBorder }} />

                    {/* Metrics table */}
                    <Box>
                        <Typography
                            variant="caption"
                            sx={{
                                color: palette.textSecondary,
                                letterSpacing: '0.06em',
                                mb: 0.75,
                                display: 'block',
                            }}
                        >
                            Quality Metrics
                        </Typography>
                        <Table size="small">
                            <TableBody>
                                {Object.entries(sessionStatus.metrics).map(([k, v]) => (
                                    <TableRow key={k}>
                                        <TableCell
                                            sx={{
                                                color: palette.textMuted,
                                                fontSize: '0.75rem',
                                                border: 'none',
                                                py: 0.25,
                                                px: 0,
                                            }}
                                        >
                                            {k.toUpperCase()}
                                        </TableCell>
                                        <TableCell
                                            sx={{
                                                color: palette.textPrimary,
                                                fontSize: '0.75rem',
                                                border: 'none',
                                                py: 0.25,
                                                textAlign: 'right',
                                            }}
                                        >
                                            {v.toFixed(4)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Box>

                    {/* Detected offsets */}
                    {Object.keys(sessionStatus.offsets).length > 0 && (
                        <Box>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: palette.textSecondary,
                                    letterSpacing: '0.06em',
                                    mb: 0.75,
                                    display: 'block',
                                }}
                            >
                                Detected Offsets (dy, dx)
                            </Typography>
                            <Table size="small">
                                <TableBody>
                                    {Object.entries(sessionStatus.offsets).map(
                                        ([vid, [dy, dx]]) => (
                                            <TableRow key={vid}>
                                                <TableCell
                                                    sx={{
                                                        color: palette.textMuted,
                                                        fontSize: '0.72rem',
                                                        border: 'none',
                                                        py: 0.25,
                                                        px: 0,
                                                        maxWidth: 160,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {vid}
                                                </TableCell>
                                                <TableCell
                                                    sx={{
                                                        color: palette.textPrimary,
                                                        fontSize: '0.72rem',
                                                        border: 'none',
                                                        py: 0.25,
                                                        textAlign: 'right',
                                                    }}
                                                >
                                                    ({dy.toFixed(1)}, {dx.toFixed(1)})
                                                </TableCell>
                                            </TableRow>
                                        ),
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    )}

                    <Divider sx={{ borderColor: palette.toolbarBorder }} />
                    <Typography
                        variant="caption"
                        sx={{ color: palette.textSecondary, fontStyle: 'italic' }}
                    >
                        Result loaded into viewer
                    </Typography>
                </>
            )}
        </Box>
    )
}
