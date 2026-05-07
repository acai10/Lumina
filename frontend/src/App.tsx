import { Alert, AppBar, Box, Button, CircularProgress, Snackbar, Toolbar, Typography } from '@mui/material';
import React from 'react';

import { useOctStore } from './app/store/octSlice';
import { useSTLStore } from './app/store/stlSlice';
import WorkspaceLayout from './features/workspace/WorkspaceLayout';
import * as octAPI from './shared/api/octAPI';
import * as stlAPI from './shared/api/stlAPI';
import StatusBar from './shared/components/StatusBar';

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB

export default function App() {
    const {
        isLoading: octLoading,
        setIsLoading: setOctLoading,
        setCurrentBScan,
        setScanType,
        setCScanMetadata,
        error: octError,
        setError: setOctError,
    } = useOctStore();
    const {
        isLoading: stlLoading,
        setLoading: setSTLLoading,
        setSTLData,
        error: stlError,
        setError: setSTLError,
    } = useSTLStore();

    const isLoading = octLoading || stlLoading;
    const activeError = octError ?? stlError;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setOctError(`File too large (max 500 MB): ${(file.size / 1024 / 1024).toFixed(0)} MB`);
            e.target.value = '';
            return;
        }
        setOctLoading(true);
        setOctError(null);
        try {
            const res = await octAPI.uploadScan(file);
            setScanType(res.scan_type);
            setCurrentBScan(res.preview);
            setCScanMetadata({ nSlices: res.n_slices, width: res.width, height: res.height });
        } catch (err) {
            setOctError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setOctLoading(false);
            e.target.value = '';
        }
    };

    const handleSTLChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) {
            setSTLError(`File too large (max 500 MB): ${(file.size / 1024 / 1024).toFixed(0)} MB`);
            e.target.value = '';
            return;
        }
        setSTLLoading(true);
        setSTLError(null);
        try {
            const data = await stlAPI.uploadSTL(file);
            setSTLData(data);
        } catch (err) {
            setSTLError(err instanceof Error ? err.message : 'STL upload failed');
        } finally {
            setSTLLoading(false);
            e.target.value = '';
        }
    };

    const handleCloseError = () => {
        setOctError(null);
        setSTLError(null);
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

            <Snackbar
                open={activeError !== null}
                autoHideDuration={6000}
                onClose={handleCloseError}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert severity="error" onClose={handleCloseError} sx={{ width: '100%' }}>
                    {activeError}
                </Alert>
            </Snackbar>
        </Box>
    );
}
