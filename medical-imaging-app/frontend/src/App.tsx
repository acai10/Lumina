import { AppBar, Box, Button, CircularProgress, Toolbar, Typography } from '@mui/material';
import React from 'react';

import { useOctStore } from './app/store/octSlice';
import WorkspaceLayout from './features/workspace/WorkspaceLayout';
import * as octAPI from './shared/api/octAPI';
import StatusBar from './shared/components/StatusBar';

export default function App() {
    const { isLoading, setIsLoading, setCurrentBScan, setScanType, setCScanMetadata } =
        useOctStore();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoading(true);
        try {
            const res = await octAPI.uploadScan(file);
            setScanType(res.scan_type);
            setCurrentBScan(res.preview);
            setCScanMetadata({ nSlices: res.n_slices, width: res.width, height: res.height });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            <AppBar position="static" elevation={0}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        OCT Medical Imaging
                    </Typography>
                    {isLoading && <CircularProgress size={22} sx={{ mr: 2, color: 'white' }} />}
                    <Button
                        variant="outlined"
                        color="inherit"
                        component="label"
                        disabled={isLoading}
                    >
                        Load Scan
                        <input
                            type="file"
                            hidden
                            accept=".dcm,.mha,.nrrd,.raw,*"
                            onChange={handleFileChange}
                        />
                    </Button>
                </Toolbar>
            </AppBar>

            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <WorkspaceLayout />
            </Box>

            <StatusBar />
        </Box>
    );
}
