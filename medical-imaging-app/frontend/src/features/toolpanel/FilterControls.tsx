import { Box, Button, FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useState } from 'react';

import { useOctStore } from '../../app/store/octSlice';
import * as octAPI from '../../shared/api/octAPI';

type FilterType = 'gaussian' | 'median' | 'speckle_reduction';

export default function FilterControls() {
    const [filterType, setFilterType] = useState<FilterType>('gaussian');
    const { setCurrentBScan, setIsLoading } = useOctStore();

    const handleApply = async () => {
        setIsLoading(true);
        try {
            const res = await octAPI.applyFilterToStored(filterType);
            setCurrentBScan(res.result);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth>
                <InputLabel>Filter</InputLabel>
                <Select
                    value={filterType}
                    label="Filter"
                    onChange={(e) => setFilterType(e.target.value as FilterType)}
                >
                    <MenuItem value="gaussian">Gaussian</MenuItem>
                    <MenuItem value="median">Median</MenuItem>
                    <MenuItem value="speckle_reduction">Speckle Reduction</MenuItem>
                </Select>
            </FormControl>
            <Button variant="contained" size="small" onClick={handleApply}>
                Apply
            </Button>
        </Box>
    );
}
