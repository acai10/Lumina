import { Box, Typography } from '@mui/material';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useOctStore } from '../../app/store/octSlice';

export default function AScanPlot() {
    const { aScanSignal, depthAxis } = useOctStore();

    if (aScanSignal.length === 0) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                }}
            >
                <Typography variant="caption" color="text.secondary">
                    Click on the B-scan to view the A-scan signal at that position
                </Typography>
            </Box>
        );
    }

    const data = aScanSignal.map((v, i) => ({ depth: depthAxis[i] ?? i, amplitude: v }));

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <XAxis
                    dataKey="depth"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Depth', position: 'insideBottom', offset: -2, fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line
                    type="monotone"
                    dataKey="amplitude"
                    stroke="#4fc3f7"
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
