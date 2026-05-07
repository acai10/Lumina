import CloseIcon from '@mui/icons-material/Close';
import { Box, IconButton, Tooltip } from '@mui/material';

import { useOctStore } from '../../app/store/octSlice';
import { useSTLStore } from '../../app/store/stlSlice';
import AScanPlot from '../viewport/AScanPlot';
import BScanViewer from '../viewport/BScanViewer';
import CScanNavigator from '../viewport/CScanNavigator';
import STLViewer from '../viewport/STLViewer';
import ToolPanel from '../toolpanel/ToolPanel';

export default function WorkspaceLayout() {
    const { scanType } = useOctStore();
    const { stlData, clearSTL } = useSTLStore();

    return (
        <Box sx={{ display: 'flex', height: '100%' }}>
            <ToolPanel />

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {stlData ? (
                    <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        <Tooltip title="Close STL viewer">
                            <IconButton
                                onClick={clearSTL}
                                size="small"
                                sx={{
                                    position: 'absolute',
                                    top: 8,
                                    right: 8,
                                    zIndex: 10,
                                    bgcolor: 'rgba(0,0,0,0.5)',
                                    color: 'white',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                                }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <STLViewer data={stlData} />
                    </Box>
                ) : (
                    <>
                        <Box sx={{ flex: 1, overflow: 'hidden' }}>
                            <BScanViewer />
                        </Box>

                        {scanType === 'C' && <CScanNavigator />}

                        <Box
                            sx={{
                                height: 160,
                                borderTop: 1,
                                borderColor: 'divider',
                                bgcolor: 'background.default',
                            }}
                        >
                            <AScanPlot />
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
