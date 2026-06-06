import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'
import type { SessionStatus } from '../../shared/api'
import {
    metricKeyCellSx,
    metricValueCellSx,
    offsetKeyCellSx,
    offsetValueCellSx,
    sectionHeaderSx,
} from './StitcherPanel.styles'

/** Decimal precision for the quality-metric and detected-offset readouts. */
const METRIC_DECIMALS = 4
const OFFSET_DECIMALS = 1

interface StitchResultsProps {
    status: SessionStatus
}

/** Quality-metrics + detected-offsets tables shown after a stitching session completes. */
export function StitchResults({ status }: StitchResultsProps) {
    return (
        <>
            <Divider sx={{ borderColor: palette.borderGlass }} />

            {/* Metrics table */}
            <Box>
                <Typography variant="caption" sx={sectionHeaderSx}>
                    Quality Metrics
                </Typography>
                <Table size="small">
                    <TableBody>
                        {Object.entries(status.metrics).map(([k, v]) => (
                            <TableRow key={k}>
                                <TableCell sx={metricKeyCellSx}>{k.toUpperCase()}</TableCell>
                                <TableCell sx={metricValueCellSx}>
                                    {v.toFixed(METRIC_DECIMALS)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Box>

            {/* Detected offsets */}
            {Object.keys(status.offsets).length > 0 && (
                <Box>
                    <Typography variant="caption" sx={sectionHeaderSx}>
                        Detected Offsets (dy, dx)
                    </Typography>
                    <Table size="small">
                        <TableBody>
                            {Object.entries(status.offsets).map(([vid, [dy, dx]]) => (
                                <TableRow key={vid}>
                                    <TableCell sx={offsetKeyCellSx}>{vid}</TableCell>
                                    <TableCell sx={offsetValueCellSx}>
                                        ({dy.toFixed(OFFSET_DECIMALS)},{' '}
                                        {dx.toFixed(OFFSET_DECIMALS)})
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Box>
            )}

            <Divider sx={{ borderColor: palette.borderGlass }} />
            <Typography
                variant="caption"
                sx={{ color: palette.textSecondary, fontStyle: 'italic' }}
            >
                Result loaded into viewer
            </Typography>
        </>
    )
}
