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
import { useActiveH5Tab } from '../../app/store/selectors'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { SliderRow } from './SliderRow'
import { useFilterJob } from './useFilterJob'
import type { FilterPhase } from './useFilterJob'
import { useFilterParams } from './useFilterParams'
import type { FilterTypeOrNone } from './useFilterParams'
import { labelSx, controlFontSx } from './ControlsPanel.styles'

const FILTER_KEYS = new Set<string>([
    'none',
    'gaussian',
    'median',
    'lee',
    'bm3d',
    'normalize',
    'anisotropy',
])
const isFilterType = (v: unknown): v is FilterTypeOrNone =>
    typeof v === 'string' && FILTER_KEYS.has(v)

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
    // Narrow subscription — the whole tabs array changes identity on every
    // hydration/eviction cycle; this section only needs the active H5 tab.
    const activeEntry = useActiveH5Tab()
    const fileKey = activeEntry?.name ?? ''

    // Hooks must be called unconditionally — derive args defensively above the early return
    const { phase, error, isBusy, run, revert, clearError } = useFilterJob(
        fileKey,
        activeEntry?.sourceFile,
        activeEntry?.backendVolumeId,
        activeEntry?.registeredVolumeId,
    )
    const {
        type: filterType,
        setType: setFilterType,
        params,
        updateParam,
        buildFilterStep,
    } = useFilterParams()

    if (
        !activeEntry ||
        (!activeEntry.sourceFile && !activeEntry.backendVolumeId && !activeEntry.registeredVolumeId)
    )
        return null

    const handleApply = () => (filterType === 'none' ? revert() : run(buildFilterStep()))

    return (
        <Stack spacing={1.5}>
            <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>
                PREPROCESSING
            </Typography>

            <FormControl size="small" fullWidth>
                <InputLabel sx={controlFontSx}>Filter</InputLabel>
                <Select
                    value={filterType}
                    label="Filter"
                    onChange={(e) => {
                        const v = e.target.value
                        if (isFilterType(v)) setFilterType(v)
                    }}
                    disabled={isBusy}
                    sx={controlFontSx}
                >
                    {(Object.keys(FILTER_LABELS) as FilterTypeOrNone[]).map((k) => (
                        <MenuItem key={k} value={k} sx={controlFontSx}>
                            {FILTER_LABELS[k]}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {filterType === 'gaussian' && (
                <SliderRow
                    label="Sigma"
                    value={params.gaussianSigma}
                    {...RENDER_CONTROL_LIMITS.filterGaussianSigma}
                    onChange={(v) => updateParam('gaussianSigma', v)}
                />
            )}
            {filterType === 'median' && (
                <SliderRow
                    label="Radius"
                    value={params.medianRadius}
                    {...RENDER_CONTROL_LIMITS.filterMedianRadius}
                    onChange={(v) => updateParam('medianRadius', v)}
                />
            )}
            {filterType === 'lee' && (
                <SliderRow
                    label="Window size"
                    value={params.leeWindow}
                    {...RENDER_CONTROL_LIMITS.filterLeeWindow}
                    onChange={(v) => updateParam('leeWindow', v)}
                />
            )}
            {filterType === 'bm3d' && (
                <SliderRow
                    label="Sigma PSD"
                    value={params.bm3dSigma}
                    {...RENDER_CONTROL_LIMITS.filterBm3dSigma}
                    onChange={(v) => updateParam('bm3dSigma', v)}
                />
            )}
            {filterType === 'normalize' && (
                <>
                    <SliderRow
                        label="Low percentile"
                        value={params.normalizeLow}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeLow}
                        onChange={(v) => updateParam('normalizeLow', v)}
                    />
                    <SliderRow
                        label="High percentile"
                        value={params.normalizeHigh}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeHigh}
                        onChange={(v) => updateParam('normalizeHigh', v)}
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
