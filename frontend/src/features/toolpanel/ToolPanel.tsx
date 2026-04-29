import { Box, Tab, Tabs } from '@mui/material';
import { useState } from 'react';

import FilterControls from './FilterControls';
import SegmentationControls from './SegmentationControls';
import WindowingControls from './WindowingControls';

export default function ToolPanel() {
    const [tab, setTab] = useState(0);

    return (
        <Box
            sx={{
                width: 240,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRight: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
            }}
        >
            <Tabs
                value={tab}
                onChange={(_, v: number) => setTab(v)}
                variant="fullWidth"
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tab label="Window" />
                <Tab label="Filter" />
                <Tab label="Segment" />
            </Tabs>
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                {tab === 0 && <WindowingControls />}
                {tab === 1 && <FilterControls />}
                {tab === 2 && <SegmentationControls />}
            </Box>
        </Box>
    );
}
