import {
    Alert,
    Box,
    Button,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Typography,
} from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { SliderRow } from './SliderRow'
import { useFilterJob } from './useFilterJob'
import { useFilterParams } from './useFilterParams'
import type { FilterTypeOrNone } from './useFilterParams'
import { labelSx } from './ControlsPanel.styles'

const FILTER_LABELS: Record<FilterTypeOrNone, string> = {
    none: 'None',
    gaussian: 'Gaussian',
    median: 'Median',
    lee: 'Lee',
    bm3d: 'BM3D',
    normalize: 'Normalize',
    anisotropy: 'Anisotropy',
}

const PHASE_LABEL: Record<string, string> = {
    uploading: 'Uploading…',
    processing: 'Processing…',
    downloading: 'Loading result…',
    reverting: 'Reverting…',
}

export function PreprocessingSection() {
    const { h5Files, activeH5Index } = useViewerStore()

    const activeEntry = h5Files[activeH5Index]
    if (!activeEntry || !activeEntry.sourceFile) return null

    const fileKey = activeEntry.name
    const { phase, error, isBusy, run, revert, clearError } = useFilterJob(
        fileKey,
        activeEntry.sourceFile,
    )
    const {
        filterType,
        setFilterType,
        gaussianSigma,
        setGaussianSigma,
        medianRadius,
        setMedianRadius,
        leeWindow,
        setLeeWindow,
        bm3dSigma,
        setBm3dSigma,
        normalizeLow,
        setNormalizeLow,
        normalizeHigh,
        setNormalizeHigh,
        buildFilterStep,
    } = useFilterParams()

    const handleApply = () => (filterType === 'none' ? revert() : run(buildFilterStep()))

    return (
        <Stack spacing={1.5}>
            <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>
                PREPROCESSING
            </Typography>

            <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: '0.7rem' }}>Filter</InputLabel>
                <Select
                    value={filterType}
                    label="Filter"
                    onChange={(e) => setFilterType(e.target.value as FilterTypeOrNone)}
                    disabled={isBusy}
                    sx={{ fontSize: '0.7rem' }}
                >
                    {(Object.keys(FILTER_LABELS) as FilterTypeOrNone[]).map((k) => (
                        <MenuItem key={k} value={k} sx={{ fontSize: '0.7rem' }}>
                            {FILTER_LABELS[k]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {filterType === 'gaussian' && (
                <SliderRow
                    label="Sigma"
                    value={gaussianSigma}
                    {...RENDER_CONTROL_LIMITS.filterGaussianSigma}
                    onChange={setGaussianSigma}
                />
            )}
            {filterType === 'median' && (
                <SliderRow
                    label="Radius"
                    value={medianRadius}
                    {...RENDER_CONTROL_LIMITS.filterMedianRadius}
                    onChange={setMedianRadius}
                />
            )}
            {filterType === 'lee' && (
                <SliderRow
                    label="Window size"
                    value={leeWindow}
                    {...RENDER_CONTROL_LIMITS.filterLeeWindow}
                    onChange={setLeeWindow}
                />
            )}
            {filterType === 'bm3d' && (
                <SliderRow
                    label="Sigma PSD"
                    value={bm3dSigma}
                    {...RENDER_CONTROL_LIMITS.filterBm3dSigma}
                    onChange={setBm3dSigma}
                />
            )}
            {filterType === 'normalize' && (
                <>
                    <SliderRow
                        label="Low percentile"
                        value={normalizeLow}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeLow}
                        onChange={setNormalizeLow}
                    />
                    <SliderRow
                        label="High percentile"
                        value={normalizeHigh}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeHigh}
                        onChange={setNormalizeHigh}
                    />
                </>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                    size="small"
                    variant="outlined"
                    onClick={handleApply}
                    disabled={isBusy}
                    sx={{ fontSize: '0.65rem', py: 0.4 }}
                >
                    Apply
                </Button>
                {isBusy && (
                    <>
                        <CircularProgress size={12} thickness={5} />
                        <Typography sx={{ ...labelSx, opacity: 0.6 }}>
                            {PHASE_LABEL[phase] ?? ''}
                        </Typography>
                    </>
                )}
            </Box>

            {error && (
                <Alert severity="error" sx={{ fontSize: '0.65rem', py: 0.2 }} onClose={clearError}>
                    {error}
                </Alert>
            )}
        </Stack>
    )
}
