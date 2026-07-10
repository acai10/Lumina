import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'

interface MaskDialogProps {
    /** Base64 PNG of the segmentation, or null when closed. */
    maskPng: string | null
    onClose: () => void
}

const previewLabelSx = { fontSize: '0.65rem', color: palette.textSecondary, mb: 0.5 }

/** Preview the standalone muscle/fat segmentation of the active volume. */
export function MaskDialog({ maskPng, onClose }: MaskDialogProps) {
    return (
        <Dialog open={maskPng !== null} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontSize: '0.85rem' }}>Muscle / fat segmentation</DialogTitle>
            <DialogContent dividers>
                <Typography sx={previewLabelSx}>red = muscle, blue = fat/background</Typography>
                {maskPng && (
                    <Box
                        component="img"
                        alt="segmentation mask"
                        src={`data:image/png;base64,${maskPng}`}
                        sx={{
                            width: '100%',
                            imageRendering: 'pixelated',
                            border: `1px solid ${palette.borderGlass}`,
                            borderRadius: 1,
                        }}
                    />
                )}
            </DialogContent>
            <DialogActions>
                <Button size="small" onClick={onClose}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    )
}
