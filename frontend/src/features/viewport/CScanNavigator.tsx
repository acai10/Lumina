import { Box, Slider, Typography } from '@mui/material';
import { memo } from 'react';

import { useOctStore } from '../../app/store/octSlice';
import * as octAPI from '../../shared/api/octAPI';

const CScanNavigator = memo(function CScanNavigator() {
    const {
        cScanMetadata,
        selectedSliceIndex,
        setSelectedSliceIndex,
        setCurrentBScan,
        setIsLoading,
        setError,
    } = useOctStore();

    const nSlices = cScanMetadata?.nSlices ?? 1;

    const handleChange = async (_event: Event, value: number | number[]) => {
        const idx = value as number;
        setSelectedSliceIndex(idx);
        setIsLoading(true);
        setError(null);
        try {
            const res = await octAPI.fetchSlice(idx);
            setCurrentBScan(res.image);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load slice');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 3,
                py: 1,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
            }}
        >
            <Typography variant="caption" sx={{ minWidth: 80, flexShrink: 0 }}>
                Slice {selectedSliceIndex + 1} / {nSlices}
            </Typography>
            <Slider
                min={0}
                max={Math.max(0, nSlices - 1)}
                value={selectedSliceIndex}
                onChange={handleChange}
                size="small"
                sx={{ flex: 1 }}
            />
        </Box>
    );
});

export default CScanNavigator;
