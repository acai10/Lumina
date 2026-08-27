import { useState } from 'react'

/**
 * Controlled number input that clamps on commit rather than on every keystroke.
 *
 * Typing an intermediate value like "-" or "1." has to be allowed while the field is
 * focused, so the raw text is kept locally and only parsed and clamped to
 * [min, max] on blur or Enter.
 */
const fmt = (v: number) => (v % 1 === 0 ? String(v) : v.toFixed(2))

export function useNumberInput(
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void,
) {
    const [{ prevValue, inputVal }, setState] = useState({ prevValue: value, inputVal: fmt(value) })

    if (prevValue !== value) {
        setState({ prevValue: value, inputVal: fmt(value) })
    }

    const setInputVal = (v: string) => setState((s) => ({ ...s, inputVal: v }))

    const commit = () => {
        const parsed = parseFloat(inputVal)
        if (!isNaN(parsed)) onChange(Math.min(max, Math.max(min, parsed)))
    }

    return { inputVal, setInputVal, commit }
}
