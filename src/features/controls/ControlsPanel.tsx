import { useState, useEffect } from 'react'
import { IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useViewerStore, defaultRenderControls } from '../../app/store/viewerSlice'
import { palette } from '../../shared/theme/palette'
import type { H5RenderControls } from '../../shared/types/viewer.types'

const sliderSx = {
    color: palette.tealBorder,
    py: 0,
    '& .MuiSlider-thumb': { width: 12, height: 12 },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

const labelSx = {
    fontSize: '0.7rem',
    color: palette.textDim,
    letterSpacing: '0.05em',
    userSelect: 'none' as const,
}

const inputStyle: React.CSSProperties = {
    width: 48,
    background: 'transparent',
    border: `1px solid ${palette.tealBorder}`,
    color: palette.textDim,
    fontSize: '0.7rem',
    textAlign: 'right',
    borderRadius: 3,
    padding: '1px 4px',
    outline: 'none',
}

const fmt = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(2))

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
    const [inputVal, setInputVal] = useState(fmt(value))
    useEffect(() => {
        setInputVal(fmt(value))
    }, [value])

    const commit = () => {
        const n = parseFloat(inputVal)
        if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    }

    return (
        <Stack spacing={2.5} sx={{ width: 210 }}>
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
    const [minVal, setMinVal] = useState(fmt(value[0]))
    const [maxVal, setMaxVal] = useState(fmt(value[1]))
    useEffect(() => {
        setMinVal(fmt(value[0]))
    }, [value[0]])
    useEffect(() => {
        setMaxVal(fmt(value[1]))
    }, [value[1]])

    const commitMin = () => {
        const n = parseFloat(minVal)
        if (!isNaN(n)) onChange([Math.min(value[1], Math.max(min, n)), value[1]])
    }
    const commitMax = () => {
        const n = parseFloat(maxVal)
        if (!isNaN(n)) onChange([value[0], Math.max(value[0], Math.min(max, n))])
    }

    return (
        <Stack spacing={2.5} sx={{ width: 210 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>{label}</Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <input
                        type="number"
                        value={minVal}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => setMinVal(e.target.value)}
                        onBlur={commitMin}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                        }}
                        style={inputStyle}
                    />
                    <Typography sx={{ ...labelSx, opacity: 0.4 }}>–</Typography>
                    <input
                        type="number"
                        value={maxVal}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => setMaxVal(e.target.value)}
                        onBlur={commitMax}
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
    const rc: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls

    const set = (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch)

    if (mode === 'none') return null

    return (
        <Stack
            spacing={4}
            sx={{
                position: 'absolute',
                left: 20,
                top: 8,
                zIndex: 20,
                background: palette.panelBg,
                backdropFilter: 'blur(8px)',
                border: `1px solid ${palette.tealBorder}`,
                borderRadius: 1,
                px: 1.5,
                py: 1.5,
            }}
        >
            {mode === 'h5' && (
                <>
                    <SliderRow
                        label="Volume spacing"
                        value={rc.volumeSpacing}
                        min={1}
                        max={512}
                        step={1}
                        onChange={(v) => set({ volumeSpacing: v })}
                    />
                    <SliderRow
                        label="H5 threshold"
                        value={rc.h5Threshold}
                        min={0.05}
                        max={1}
                        step={0.01}
                        onChange={(v) => set({ h5Threshold: v })}
                    />
                    <SliderRow
                        label="H5 opacity"
                        value={rc.h5Opacity}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => set({ h5Opacity: v })}
                    />
                    <SliderRow
                        label="H5 brightness"
                        value={rc.h5Brightness}
                        min={0}
                        max={10}
                        step={0.1}
                        onChange={(v) => set({ h5Brightness: v })}
                    />
                    <SliderRow
                        label="H5 contrast"
                        value={rc.h5Contrast}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => set({ h5Contrast: v })}
                    />
                    <SliderRow
                        label="H5 point size"
                        value={rc.h5PointSize}
                        min={1}
                        max={6}
                        step={0.5}
                        onChange={(v) => set({ h5PointSize: v })}
                    />
                    <RangeSliderRow
                        label="Slices (Y)"
                        value={rc.h5SliceRange}
                        min={0}
                        max={512}
                        step={1}
                        onChange={(v) => set({ h5SliceRange: v })}
                    />
                    <RangeSliderRow
                        label="Width (X)"
                        value={rc.h5WidthRange}
                        min={0}
                        max={250}
                        step={1}
                        onChange={(v) => set({ h5WidthRange: v })}
                    />
                    <RangeSliderRow
                        label="Height (Z)"
                        value={rc.h5HeightRange}
                        min={0}
                        max={250}
                        step={1}
                        onChange={(v) => set({ h5HeightRange: v })}
                    />
                </>
            )}
            {mode === 'stl' && (
                <SliderRow
                    label="STL opacity"
                    value={stlOpacity}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={setStlOpacity}
                />
            )}
            <Tooltip title="Reset" placement="right">
                <IconButton
                    size="small"
                    onClick={() => {
                        if (mode === 'h5') updateActiveRenderState({ ...defaultRenderControls })
                        else setStlOpacity(0.55)
                    }}
                    sx={{
                        alignSelf: 'center',
                        color: palette.textDim,
                        opacity: 0.6,
                        '&:hover': { opacity: 1 },
                    }}
                >
                    <RestartAltIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
