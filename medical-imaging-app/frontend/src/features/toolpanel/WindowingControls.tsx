import { Box, Slider, Typography } from '@mui/material';

import { useUIStore } from '../../app/store/uiSlice';

export default function WindowingControls() {
    const { windowLevel, windowWidth, setWindowLevel, setWindowWidth } = useUIStore();

    return (
        <Box>
            <Typography variant="subtitle2" gutterBottom>
                Window Level
            </Typography>
            <Slider
                min={0}
                max={255}
                value={windowLevel}
                onChange={(_, v) => setWindowLevel(v as number)}
                valueLabelDisplay="auto"
                size="small"
            />
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Window Width
            </Typography>
            <Slider
                min={1}
                max={512}
                value={windowWidth}
                onChange={(_, v) => setWindowWidth(v as number)}
                valueLabelDisplay="auto"
                size="small"
            />
        </Box>
    );
}
