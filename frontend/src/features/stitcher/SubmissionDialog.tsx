import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Typography from '@mui/material/Typography'
import { buildSubmission } from '../../shared/api'
import type { SubmissionResult } from '../../shared/api'
import { useViewerStore } from '../../app/store/viewerSlice'
import { palette } from '../../shared/theme/palette'

interface SubmissionDialogProps {
    open: boolean
    volumeId: string
    onClose: () => void
}

const previewLabelSx = { fontSize: '0.65rem', color: palette.textSecondary, mb: 0.5 }
const previewImgSx = {
    width: '100%',
    imageRendering: 'pixelated' as const,
    border: `1px solid ${palette.borderGlass}`,
    borderRadius: 1,
}

/**
 * Builds the challenge submission from a volume and previews it before saving.
 *
 * Shows the surface depth map and, for the tissue dataset, the muscle/fat mask as
 * PNGs returned by the backend, so the output can be checked rather than submitted
 * blind.
 */

/** Build + preview the challenge submission files for one (stitched) volume. */
export function SubmissionDialog({ open, volumeId, onClose }: SubmissionDialogProps) {
    const setNotification = useViewerStore((s) => s.setNotification)
    const [tissue, setTissue] = useState(false)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<SubmissionResult | null>(null)

    const handleBuild = async () => {
        setBusy(true)
        try {
            const res = await buildSubmission(volumeId, { tissue })
            setResult(res)
            setNotification({
                message: `Submission built: ${res.h5_filename}`,
                severity: 'success',
            })
        } catch (err) {
            setNotification({
                message: err instanceof Error ? err.message : 'Build submission failed',
                severity: 'error',
            })
        } finally {
            setBusy(false)
        }
    }

    const handleClose = () => {
        setResult(null)
        onClose()
    }

    const stats = result?.stats ?? null

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontSize: '0.85rem' }}>Build challenge submission</DialogTitle>
            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={tissue}
                            onChange={(e) => setTissue(e.target.checked)}
                            disabled={busy}
                        />
                    }
                    label={
                        <Typography sx={{ fontSize: '0.75rem' }}>
                            Tissue dataset (also build muscle/fat mask)
                        </Typography>
                    }
                />

                {result && (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box>
                            <Typography sx={previewLabelSx}>
                                surface — depth map (blue = shallow, red = deep)
                            </Typography>
                            <Box
                                component="img"
                                alt="surface preview"
                                src={`data:image/png;base64,${result.surface_png}`}
                                sx={previewImgSx}
                            />
                        </Box>
                        {result.mask_png && (
                            <Box>
                                <Typography sx={previewLabelSx}>
                                    mask — red = muscle, blue = fat/background
                                </Typography>
                                <Box
                                    component="img"
                                    alt="mask preview"
                                    src={`data:image/png;base64,${result.mask_png}`}
                                    sx={previewImgSx}
                                />
                            </Box>
                        )}
                        {stats && (
                            <Typography sx={{ fontSize: '0.65rem', color: palette.textSecondary }}>
                                Saved <strong>{result.h5_filename}</strong> · coverage{' '}
                                {String(stats.coverage_pct)}% · depth {String(stats.depth_min_mm)}–
                                {String(stats.depth_max_mm)} mm
                                {stats.muscle_pct !== undefined
                                    ? ` · muscle ${String(stats.muscle_pct)}%`
                                    : ''}
                            </Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button size="small" onClick={handleClose} disabled={busy}>
                    Close
                </Button>
                <Button
                    size="small"
                    variant="contained"
                    onClick={handleBuild}
                    disabled={busy || !volumeId}
                    startIcon={busy ? <CircularProgress size={12} thickness={5} /> : undefined}
                >
                    {result ? 'Rebuild' : 'Build'}
                </Button>
            </DialogActions>
        </Dialog>
    )
}
