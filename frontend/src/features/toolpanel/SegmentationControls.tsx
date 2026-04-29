import { Box, Button, FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useState } from 'react';

import { useOctStore } from '../../app/store/octSlice';
import * as octAPI from '../../shared/api/octAPI';

type SegMethod = 'threshold' | 'graph_cut';

export default function SegmentationControls() {
    const [method, setMethod] = useState<SegMethod>('threshold');
    const { setOverlayMask, setIsLoading } = useOctStore();

    const handleRun = async () => {
        setIsLoading(true);
        try {
            const res = await octAPI.runSegmentationOnStored(method);
            setOverlayMask(res.mask);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth>
                <InputLabel>Method</InputLabel>
                <Select
                    value={method}
                    label="Method"
                    onChange={(e) => setMethod(e.target.value as SegMethod)}
                >
                    <MenuItem value="threshold">Threshold (Otsu)</MenuItem>
                    <MenuItem value="graph_cut">Graph Cut</MenuItem>
                </Select>
            </FormControl>
            <Button variant="contained" color="secondary" size="small" onClick={handleRun}>
                Run Segmentation
            </Button>
        </Box>
    );
}
