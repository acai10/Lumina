import { IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import {
    sliderSx,
    labelSx,
    inputStyle,
    panelSx,
    resetButtonSx,
    sliderStackSx,
    separatorSx,
} from './ControlsPanel.styles'
import { useNumberInput } from './useNumberInput'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import type { H5RenderControls } from '../../shared/types/viewer.types'

// ── Single slider ────────────────────────────────────────────────────────────

interface SliderRowProps {
    label: string
    value: number
    min: number
    max: number
    step: number
    onChange: (v: number) => void
}

function SliderRow({ label, value, min, max, step, onChange }: SliderRowProps) {
    const { inputVal, setInputVal, commit } = useNumberInput(value, min, max, onChange)

    return (
        <Stack spacing={2.5} sx={sliderStackSx}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>{label}</Typography>
                <input
                    type="number"
                    value={inputVal}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => setInputVal(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                    style={inputStyle}
                />
            </Stack>
            <Slider
                size="small"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(_, v) => onChange(typeof v === 'number' ? v : v[0])}
                sx={sliderSx}
            />
        </Stack>
    )
}

// ── Range slider (two handles) ───────────────────────────────────────────────

interface RangeSliderRowProps {
    label: string
    value: [number, number]
    min: number
    max: number
    step: number
    onChange: (v: [number, number]) => void
}

function RangeSliderRow({ label, value, min, max, step, onChange }: RangeSliderRowProps) {
    const minInput = useNumberInput(value[0], min, value[1], (v) => onChange([v, value[1]]))
    const maxInput = useNumberInput(value[1], value[0], max, (v) => onChange([value[0], v]))

    return (
        <Stack spacing={2.5} sx={sliderStackSx}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>{label}</Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <input
                        type="number"
                        value={minInput.inputVal}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => minInput.setInputVal(e.target.value)}
                        onBlur={minInput.commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        style={inputStyle}
                    />
                    <Typography sx={separatorSx}>–</Typography>
                    <input
                        type="number"
                        value={maxInput.inputVal}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => maxInput.setInputVal(e.target.value)}
                        onBlur={maxInput.commit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        style={inputStyle}
                    />
                </Stack>
            </Stack>
            <Slider
                size="small"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(_, v) => {
                    if (Array.isArray(v)) onChange(v as [number, number])
                }}
                sx={sliderSx}
            />
        </Stack>
    )
}

// ── Panel ────────────────────────────────────────────────────────────────────

export default function ControlsPanel() {
    const {
        mode,
        h5Files,
        activeH5Index,
        h5PerFileStates,
        updateActiveRenderState,
        stlOpacity,
        setStlOpacity,
    } = useViewerStore()

    const activeKey = h5Files[activeH5Index]?.name
    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls

    const updateControls = (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch)

    if (mode === 'none') return null

    return (
        <Stack spacing={4} sx={panelSx}>
            {mode === 'h5' && (
                <>
                    <SliderRow
                        label="Volume spacing"
                        value={renderControls.volumeSpacing}
                        {...RENDER_CONTROL_LIMITS.volumeSpacing}
                        onChange={(v) => updateControls({ volumeSpacing: v })}
                    />
                    <SliderRow
                        label="H5 threshold"
                        value={renderControls.h5Threshold}
                        {...RENDER_CONTROL_LIMITS.h5Threshold}
                        onChange={(v) => updateControls({ h5Threshold: v })}
                    />
                    <SliderRow
                        label="H5 opacity"
                        value={renderControls.h5Opacity}
                        {...RENDER_CONTROL_LIMITS.h5Opacity}
                        onChange={(v) => updateControls({ h5Opacity: v })}
                    />
                    <SliderRow
                        label="H5 brightness"
                        value={renderControls.h5Brightness}
                        {...RENDER_CONTROL_LIMITS.h5Brightness}
                        onChange={(v) => updateControls({ h5Brightness: v })}
                    />
                    <SliderRow
                        label="H5 contrast"
                        value={renderControls.h5Contrast}
                        {...RENDER_CONTROL_LIMITS.h5Contrast}
                        onChange={(v) => updateControls({ h5Contrast: v })}
                    />
                    <SliderRow
                        label="H5 point size"
                        value={renderControls.h5PointSize}
                        {...RENDER_CONTROL_LIMITS.h5PointSize}
                        onChange={(v) => updateControls({ h5PointSize: v })}
                    />
                    <RangeSliderRow
                        label="Slices (Y)"
                        value={renderControls.h5SliceRange}
                        {...RENDER_CONTROL_LIMITS.h5SliceRange}
                        onChange={(v) => updateControls({ h5SliceRange: v })}
                    />
                    <RangeSliderRow
                        label="Width (X)"
                        value={renderControls.h5WidthRange}
                        {...RENDER_CONTROL_LIMITS.h5WidthRange}
                        onChange={(v) => updateControls({ h5WidthRange: v })}
                    />
                    <RangeSliderRow
                        label="Height (Z)"
                        value={renderControls.h5HeightRange}
                        {...RENDER_CONTROL_LIMITS.h5HeightRange}
                        onChange={(v) => updateControls({ h5HeightRange: v })}
                    />
                </>
            )}
            {mode === 'stl' && (
                <SliderRow
                    label="STL opacity"
                    value={stlOpacity}
                    {...RENDER_CONTROL_LIMITS.stlOpacity}
                    onChange={setStlOpacity}
                />
            )}
            <Tooltip title="Reset" placement="right">
                <IconButton
                    size="small"
                    onClick={() => {
                        if (mode === 'h5') updateActiveRenderState({ ...defaultRenderControls })
                        else setStlOpacity(DEFAULT_STL_OPACITY)
                    }}
                    sx={resetButtonSx}
                >
                    <RestartAltIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
