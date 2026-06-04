import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useViewerStore } from '../../app/store/viewerSlice'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { SliderRow } from './SliderRow'
import { useFilterJob } from './useFilterJob'
import type { FilterPhase } from './useFilterJob'
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

const PHASE_LABEL: Partial<Record<FilterPhase, string>> = {
    uploading: 'Uploading…',
    processing: 'Processing…',
    downloading: 'Loading result…',
    reverting: 'Reverting…',
}

export function PreprocessingSection() {
    const { tabs, activeTabIndex } = useViewerStore()

    const activeTab = tabs[activeTabIndex]
    const activeEntry = activeTab?.type === 'h5' ? activeTab : null
    const fileKey = activeEntry?.name ?? ''

    // Hooks must be called unconditionally — derive args defensively above the early return
    const { phase, error, isBusy, run, revert, clearError } = useFilterJob(
        fileKey,
        activeEntry?.sourceFile,
        activeEntry?.backendVolumeId,
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

    if (!activeEntry || (!activeEntry.sourceFile && !activeEntry.backendVolumeId)) return null

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
