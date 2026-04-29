import { Box, Divider, Typography } from '@mui/material';

import { useOctStore } from '../../app/store/octSlice';

export default function StatusBar() {
    const { scanType, cScanMetadata, selectedSliceIndex } = useOctStore();

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2,
                py: 0.5,
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider',
            }}
        >
            <Typography variant="caption" color="text.secondary">
                Scan Type: {scanType ?? '—'}
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Typography variant="caption" color="text.secondary">
                Dimensions:{' '}
                {cScanMetadata ? `${cScanMetadata.width} × ${cScanMetadata.height}` : '—'}
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Typography variant="caption" color="text.secondary">
                Slices: {cScanMetadata?.nSlices ?? '—'}
            </Typography>
            <Divider orientation="vertical" flexItem />
            <Typography variant="caption" color="text.secondary">
                Slice Index: {scanType === 'C' ? selectedSliceIndex : '—'}
            </Typography>
        </Box>
    );
}
