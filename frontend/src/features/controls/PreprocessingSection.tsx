import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5PerFileState } from '../../shared/types/viewer.types'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { SliderRow } from './SliderRow'
import { useFilterJob } from './useFilterJob'
import type { FilterPhase } from './useFilterJob'
import { usePipeline } from './useFilterParams'
import type { FilterTypeOrNone, PipelineStep } from './useFilterParams'
import { labelSx, controlFontSx, iconButtonSx } from './ControlsPanel.styles'
import { eyebrowSx, compactButtonSx } from '../../shared/theme/uiTokens'
import { palette } from '../../shared/theme/palette'

const FILTER_LABELS: Record<FilterTypeOrNone, string> = {
    none: '— select —',
    gaussian: 'Gaussian',
    median: 'Median',
    mean: 'Mean',
    normalize: 'Normalize',
    edge: 'Edge highlight',
}

const FILTER_OPTIONS = Object.entries(FILTER_LABELS) as [FilterTypeOrNone, string][]
const FILTER_TYPE_KEYS = new Set(Object.keys(FILTER_LABELS))
const isFilterTypeOrNone = (v: string): v is FilterTypeOrNone => FILTER_TYPE_KEYS.has(v)

const PHASE_LABEL: Partial<Record<FilterPhase, string>> = {
    uploading: 'Uploading…',
    processing: 'Processing…',
    downloading: 'Loading result…',
    reverting: 'Reverting…',
}

/** Param sliders for a single pipeline step — rendered inline below the type selector. */
function StepParamSliders({
    step,
    index,
    disabled,
    updateStepParam,
}: {
    step: PipelineStep
    index: number
    disabled: boolean
    updateStepParam: (i: number, k: keyof PipelineStep['params'], v: number) => void
}) {
    const up = (k: keyof PipelineStep['params'], v: number) => updateStepParam(index, k, v)
    switch (step.type) {
        case 'gaussian':
            return (
                <SliderRow
                    label="Sigma"
                    value={step.params.gaussianSigma}
                    {...RENDER_CONTROL_LIMITS.filterGaussianSigma}
                    disabled={disabled}
                    onChange={(v) => up('gaussianSigma', v)}
                />
            )
        case 'median':
            return (
                <SliderRow
                    label="Radius"
                    value={step.params.medianRadius}
                    {...RENDER_CONTROL_LIMITS.filterMedianRadius}
                    disabled={disabled}
                    onChange={(v) => up('medianRadius', v)}
                />
            )
        case 'mean':
            return (
                <SliderRow
                    label="Size"
                    value={step.params.meanSize}
                    {...RENDER_CONTROL_LIMITS.filterMeanSize}
                    disabled={disabled}
                    onChange={(v) => up('meanSize', v)}
                />
            )
        case 'normalize':
            return (
                <>
                    <SliderRow
                        label="Low %ile"
                        value={step.params.normalizeLow}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeLow}
                        disabled={disabled}
                        onChange={(v) => up('normalizeLow', v)}
                    />
                    <SliderRow
                        label="High %ile"
                        value={step.params.normalizeHigh}
                        {...RENDER_CONTROL_LIMITS.filterNormalizeHigh}
                        disabled={disabled}
                        onChange={(v) => up('normalizeHigh', v)}
                    />
                </>
            )
        default:
            return null
    }
}

export function PreprocessingSection() {
    const { tabs, activeTabIndex, h5PerFileStates, setShowingComparison } = useViewerStore(
        useShallow((s) => ({
            tabs: s.tabs,
            activeTabIndex: s.activeTabIndex,
            h5PerFileStates: s.h5PerFileStates,
            setShowingComparison: s.setShowingComparison,
        })),
    )

    const activeTab = tabs[activeTabIndex]
    const activeEntry = activeTab?.type === 'h5' ? activeTab : null
    const fileKey = activeEntry?.name ?? ''
    const perFile: H5PerFileState | undefined = fileKey ? h5PerFileStates[fileKey] : undefined
    const filterApplied = perFile?.filterApplied ?? false
    const showingComparison = perFile?.showingComparison ?? false

    // Hooks must be called unconditionally — derive args defensively above the early return
    const { phase, error, isBusy, run, revert, clearError } = useFilterJob(
        fileKey,
        activeEntry?.sourceFile,
        activeEntry?.backendVolumeId,
        activeEntry?.registeredVolumeId,
    )
    const { pipeline, buildFilterChain } = usePipeline(fileKey)
    const { steps, addStep, removeStep, moveStep, updateStepType, updateStepParam, reset } =
        pipeline

    if (
        !activeEntry ||
        (!activeEntry.sourceFile && !activeEntry.backendVolumeId && !activeEntry.registeredVolumeId)
    )
        return null

    const hasActiveSteps = steps.some((s) => s.type !== 'none')

    const handleApply = () => {
        const chain = buildFilterChain()
        if (chain.length === 0) {
            void revert()
        } else {
            void run(chain)
        }
    }

    const handleReset = () => {
        reset()
        void revert()
    }

    return (
        <Stack spacing={1.5}>
            <Typography sx={eyebrowSx}>PREPROCESSING</Typography>

            {/* Pipeline steps */}
            <Stack spacing={1}>
                {steps.map((step, i) => (
                    <Box
                        key={i}
                        sx={{
                            border: `1px solid ${palette.borderGlass}`,
                            borderRadius: 1,
                            p: 1,
                            background: palette.surfaceSubtle,
                        }}
                    >
                        <Stack spacing={0.75}>
                            {/* Step header: type selector + reorder/remove */}
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Typography
                                    sx={{
                                        ...labelSx,
                                        minWidth: 16,
                                        textAlign: 'center',
                                        opacity: 0.5,
                                    }}
                                >
                                    {i + 1}
                                </Typography>
                                <FormControl size="small" fullWidth>
                                    <InputLabel sx={controlFontSx}>Filter</InputLabel>
                                    <Select
                                        value={step.type}
                                        label="Filter"
                                        onChange={(e) => {
                                            if (isFilterTypeOrNone(e.target.value))
                                                updateStepType(i, e.target.value)
                                        }}
                                        disabled={isBusy}
                                        sx={controlFontSx}
                                    >
                                        {FILTER_OPTIONS.map(([k, label]) => (
                                            <MenuItem key={k} value={k} sx={controlFontSx}>
                                                {label}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Tooltip title="Move up">
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => moveStep(i, 'up')}
                                            disabled={isBusy || i === 0}
                                            sx={iconButtonSx}
                                        >
                                            <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title="Move down">
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => moveStep(i, 'down')}
                                            disabled={isBusy || i === steps.length - 1}
                                            sx={iconButtonSx}
                                        >
                                            <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title="Remove step">
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => removeStep(i)}
                                            disabled={isBusy || steps.length === 1}
                                            sx={{
                                                ...iconButtonSx,
                                                '&:hover': { color: palette.danger },
                                            }}
                                        >
                                            <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Stack>

                            {/* Step params */}
                            <StepParamSliders
                                step={step}
                                index={i}
                                disabled={isBusy}
                                updateStepParam={updateStepParam}
                            />
                        </Stack>
                    </Box>
                ))}
            </Stack>

            {/* Add step */}
            <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={addStep}
                disabled={isBusy}
                sx={{ ...compactButtonSx, alignSelf: 'flex-start' }}
            >
                Add step
            </Button>

            {/* Apply / Reset / spinner */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button
                    size="small"
                    variant="contained"
                    onClick={handleApply}
                    disabled={isBusy || !hasActiveSteps}
                    sx={compactButtonSx}
                >
                    Apply
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={handleReset}
                    disabled={isBusy}
                    sx={compactButtonSx}
                >
                    Reset
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

            {/* Compare toggle */}
            {filterApplied && (
                <Tooltip title={showingComparison ? 'Show filtered image' : 'Show original'}>
                    <span style={{ width: '100%' }}>
                        <ToggleButton
                            value="compare"
                            size="small"
                            selected={showingComparison}
                            onChange={() => setShowingComparison(fileKey, !showingComparison)}
                            disabled={isBusy}
                            sx={{ ...compactButtonSx, textTransform: 'none', width: '100%' }}
                        >
                            {showingComparison ? 'Filtered' : 'Compare'}
                        </ToggleButton>
                    </span>
                </Tooltip>
            )}

            {error && (
                <Alert severity="error" sx={{ fontSize: '0.65rem', py: 0.2 }} onClose={clearError}>
                    {error}
                </Alert>
            )}
        </Stack>
    )
}
