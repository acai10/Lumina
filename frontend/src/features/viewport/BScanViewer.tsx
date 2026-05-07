import { Box, Typography } from '@mui/material';
import { memo } from 'react';
import type { MouseEvent } from 'react';

import { useOctStore } from '../../app/store/octSlice';
import * as octAPI from '../../shared/api/octAPI';
import OverlayCanvas from './OverlayCanvas';

const BScanViewer = memo(function BScanViewer() {
    const { currentBScan, selectedSliceIndex, setAScanSignal } = useOctStore();

    const handleClick = async (e: MouseEvent<HTMLImageElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const xRatio = (e.clientX - rect.left) / rect.width;
        const pixelX = Math.round(xRatio * e.currentTarget.naturalWidth);
        try {
            const res = await octAPI.fetchAScan(pixelX, selectedSliceIndex);
            setAScanSignal(res.signal, res.depth_axis);
        } catch {
            // click errors are non-critical; silently ignore
        }
    };

    if (!currentBScan) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    bgcolor: 'background.default',
                }}
            >
                <Typography color="text.secondary">Load a scan to begin</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <img
                src={`data:image/png;base64,${currentBScan}`}
                alt="B-Scan"
                onClick={handleClick}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    cursor: 'crosshair',
                }}
            />
            <OverlayCanvas />
        </Box>
    );
});

export default BScanViewer;
