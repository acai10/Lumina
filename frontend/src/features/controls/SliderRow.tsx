import { Slider, Stack, Typography } from '@mui/material'
import { sliderSx, labelSx, NumberInput, sliderStackSx, separatorSx } from './ControlsPanel.styles'
import { useNumberInput } from './useNumberInput'

interface SliderRowProps {
    label: string
    value: number
    min: number
    max: number
    step: number
    disabled?: boolean
    onChange: (v: number) => void
}

/**
 * Labelled slider rows used throughout the controls panel.
 *
 * `SliderRow` is a single value, `RangeSliderRow` a two-handle range. Both pair the
 * slider with a number input so a value can be typed as well as dragged.
 */
export function SliderRow({ label, value, min, max, step, disabled, onChange }: SliderRowProps) {
    const { inputVal, setInputVal, commit } = useNumberInput(value, min, max, onChange)

    return (
        <Stack spacing={2.5} sx={sliderStackSx}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>{label}</Typography>
                <NumberInput
                    type="number"
                    value={inputVal}
                    min={min}
                    max={max}
                    step={step}
                    disabled={disabled}
                    onChange={(e) => setInputVal(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                />
            </Stack>
            <Slider
                size="small"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(_, v) => onChange(typeof v === 'number' ? v : v[0])}
                sx={sliderSx}
            />
        </Stack>
    )
}

interface RangeSliderRowProps {
    label: string
    value: [number, number]
    min: number
    max: number
    step: number
    onChange: (v: [number, number]) => void
}

export function RangeSliderRow({ label, value, min, max, step, onChange }: RangeSliderRowProps) {
    const minInput = useNumberInput(value[0], min, value[1], (v) => onChange([v, value[1]]))
    const maxInput = useNumberInput(value[1], value[0], max, (v) => onChange([value[0], v]))

    return (
        <Stack spacing={2.5} sx={sliderStackSx}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={labelSx}>{label}</Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <NumberInput
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
                    />
                    <Typography sx={separatorSx}>–</Typography>
                    <NumberInput
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
                    if (Array.isArray(v) && v.length === 2) onChange([v[0], v[1]])
                }}
                sx={sliderSx}
            />
        </Stack>
    )
}
