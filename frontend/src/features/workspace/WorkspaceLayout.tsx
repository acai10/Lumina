import { Box } from '@mui/material';

import { useOctStore } from '../../app/store/octSlice';
import AScanPlot from '../viewport/AScanPlot';
import BScanViewer from '../viewport/BScanViewer';
import CScanNavigator from '../viewport/CScanNavigator';
import ToolPanel from '../toolpanel/ToolPanel';

export default function WorkspaceLayout() {
    const { scanType } = useOctStore();

    return (
        <Box sx={{ display: 'flex', height: '100%' }}>
            <ToolPanel />

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
            </Box>
        </Box>
    );
}
