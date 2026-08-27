import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'
import type { SessionStatus } from '../../shared/api'
import { SubmissionDialog } from './SubmissionDialog'
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

/**
 * Tables of the quality metrics and the recovered per-tile offsets of a session.
 *
 * The offsets are what the registration actually solved for, so this is also where a
 * failed pair shows up: a tile whose offset does not follow its neighbours.
 */

/** Quality-metrics + detected-offsets tables shown after a stitching session completes. */
export function StitchResults({ status }: StitchResultsProps) {
    const [submissionOpen, setSubmissionOpen] = useState(false)
    const mergedId = status.merged_volume_id

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

            {/* Build the challenge submission (surface + optional mask) from the merge */}
            {mergedId && (
                <Button
                    variant="contained"
                    size="small"
                    fullWidth
                    onClick={() => setSubmissionOpen(true)}
                    sx={{ mt: 1 }}
                >
                    Build submission
                </Button>
            )}
            <SubmissionDialog
                open={submissionOpen}
                volumeId={mergedId ?? ''}
                onClose={() => setSubmissionOpen(false)}
            />
        </>
    )
}
