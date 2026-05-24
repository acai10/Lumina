import { useState } from 'react'
import {
    Button,
    CircularProgress,
    MenuItem,
    Select,
    Stack,
    Typography,
} from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { FilterParams } from '../../shared/types/viewer.types'
import { SliderRow } from './SliderRow'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { labelSx } from './ControlsPanel.styles'

export default function PreprocessingSection() {
    const { h5Files, activeH5Index, h5PerFileStates, reprocessActiveH5 } = useViewerStore()
    const activeKey = h5Files[activeH5Index]?.name
    const perFileState = activeKey ? h5PerFileStates[activeKey] : undefined
    const isReprocessing = perFileState?.isReprocessing ?? false
    const committedParams = perFileState?.renderControls.filterParams ?? { type: 'none' as const }

    const [draftType, setDraftType] = useState<FilterParams['type']>(committedParams.type)
    const [gaussianSigma, setGaussianSigma] = useState(
        committedParams.type === 'gaussian' ? committedParams.sigma : 1.5,
    )
    const [medianRadius, setMedianRadius] = useState(
        committedParams.type === 'median' ? committedParams.kernelRadius : 1,
    )

    const handleApply = () => {
        let params: FilterParams
        if (draftType === 'gaussian') {
            params = { type: 'gaussian', sigma: gaussianSigma }
        } else if (draftType === 'median') {
            params = { type: 'median', kernelRadius: medianRadius }
        } else {
            params = { type: 'none' }
        }
        reprocessActiveH5(params)
    }

    const selectSx = {
        fontSize: '0.7rem',
        color: palette.textDim,
        height: 26,
        '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.tealBorder },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.tealBorder },
        '& .MuiSvgIcon-root': { color: palette.textDim },
        width: 120,
    }

    const menuItemSx = { fontSize: '0.7rem' }

    return (
        <Stack spacing={2}>
            <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.8 }}>
                VORVERARBEITUNG
            </Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>Filter</Typography>
                <Select
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value as FilterParams['type'])}
                    size="small"
                    sx={selectSx}
                    disabled={isReprocessing}
                >
                    <MenuItem value="none" sx={menuItemSx}>Keine</MenuItem>
                    <MenuItem value="gaussian" sx={menuItemSx}>Gaussian</MenuItem>
                    <MenuItem value="median" sx={menuItemSx}>Median</MenuItem>
                </Select>
            </Stack>

            {draftType === 'gaussian' && (
                <SliderRow
                    label="Sigma"
                    value={gaussianSigma}
                    {...RENDER_CONTROL_LIMITS.filterGaussianSigma}
                    onChange={setGaussianSigma}
                />
            )}

            {draftType === 'median' && (
                <SliderRow
                    label="Kernelgröße"
                    value={medianRadius}
                    {...RENDER_CONTROL_LIMITS.filterMedianRadius}
                    onChange={(v) => setMedianRadius(Math.round(v))}
                />
            )}

            <Button
                size="small"
                variant="outlined"
                disabled={isReprocessing}
                onClick={handleApply}
                sx={{
                    alignSelf: 'flex-start',
                    fontSize: '0.65rem',
                    color: palette.tealLabel,
                    borderColor: palette.tealBorder,
                    minWidth: 0,
                    px: 1.5,
                    py: 0.25,
                    '&:hover': { borderColor: palette.tealLabel, background: 'rgba(100,255,200,0.06)' },
                    '&.Mui-disabled': { color: palette.textFaint, borderColor: palette.tealBorder },
                }}
            >
                {isReprocessing ? (
                    <Stack direction="row" spacing={0.75} alignItems="center">
                        <CircularProgress size={10} sx={{ color: palette.tealLabel }} />
                        <span>Verarbeite…</span>
                    </Stack>
                ) : (
                    'Anwenden'
                )}
            </Button>
        </Stack>
    )
}
