import { AppBar, Box, Button, CircularProgress, Toolbar, Typography } from '@mui/material';
import React from 'react';

import { useOctStore } from './app/store/octSlice';
import { useSTLStore } from './app/store/stlSlice';
import WorkspaceLayout from './features/workspace/WorkspaceLayout';
import * as octAPI from './shared/api/octAPI';
import * as stlAPI from './shared/api/stlAPI';
import StatusBar from './shared/components/StatusBar';

export default function App() {
    const { isLoading: octLoading, setIsLoading: setOctLoading, setCurrentBScan, setScanType, setCScanMetadata } =
        useOctStore();
    const { isLoading: stlLoading, setLoading: setSTLLoading, setSTLData } = useSTLStore();

    const isLoading = octLoading || stlLoading;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setOctLoading(true);
        try {
            const res = await octAPI.uploadScan(file);
            setScanType(res.scan_type);
            setCurrentBScan(res.preview);
            setCScanMetadata({ nSlices: res.n_slices, width: res.width, height: res.height });
        } finally {
            setOctLoading(false);
        }
    };

    const handleSTLChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSTLLoading(true);
        try {
            const data = await stlAPI.uploadSTL(file);
            setSTLData(data);
        } finally {
            setSTLLoading(false);
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
                        sx={{ mr: 1 }}
                    >
                        Load Scan
                        <input
                            type="file"
                            hidden
                            accept=".dcm,.mha,.nrrd,.raw,*"
                            onChange={handleFileChange}
                        />
                    </Button>
                    <Button
                        variant="outlined"
                        color="inherit"
                        component="label"
                        disabled={isLoading}
                    >
                        Load STL
                        <input
                            type="file"
                            hidden
                            accept=".stl"
                            onChange={handleSTLChange}
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
