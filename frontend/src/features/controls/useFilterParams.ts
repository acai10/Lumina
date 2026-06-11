import { useState } from 'react'
import type { FilterStep, FilterType } from '../../shared/api/types'

export type FilterTypeOrNone = FilterType | 'none'

/** Per-step mutable param bag — only the fields relevant to the chosen type are used. */
export interface StepParams {
    gaussianSigma: number
    medianRadius: number
    meanSize: number
    normalizeLow: number
    normalizeHigh: number
}

const DEFAULT_STEP_PARAMS: StepParams = {
    gaussianSigma: 1.5,
    medianRadius: 3,
    meanSize: 3,
    normalizeLow: 2.0,
    normalizeHigh: 98.0,
}

export interface PipelineStep {
    type: FilterTypeOrNone
    params: StepParams
}

const BLANK_STEP = (): PipelineStep => ({
    type: 'none',
    params: { ...DEFAULT_STEP_PARAMS },
})

/** Build a `FilterStep` from a `PipelineStep`, or `null` for type === 'none'. */
export function buildStep(step: PipelineStep): FilterStep | null {
    switch (step.type) {
        case 'gaussian':
            return { type: 'gaussian', params: { sigma: step.params.gaussianSigma } }
        case 'median':
            return { type: 'median', params: { size: step.params.medianRadius } }
        case 'mean':
            return { type: 'mean', params: { size: step.params.meanSize } }
        case 'normalize':
            return {
                type: 'normalize',
                params: {
                    low_percentile: step.params.normalizeLow,
                    high_percentile: step.params.normalizeHigh,
                },
            }
        case 'edge':
            return { type: 'edge', params: {} as Record<string, never> }
        default:
            return null
    }
}

export function usePipeline() {
    const [steps, setSteps] = useState<PipelineStep[]>([BLANK_STEP()])

    const addStep = () => setSteps((prev) => [...prev, BLANK_STEP()])

    const removeStep = (index: number) => setSteps((prev) => prev.filter((_, i) => i !== index))

    const moveStep = (index: number, direction: 'up' | 'down') =>
        setSteps((prev) => {
            const next = [...prev]
            const target = direction === 'up' ? index - 1 : index + 1
            if (target < 0 || target >= next.length) return prev
            ;[next[index], next[target]] = [next[target], next[index]]
            return next
        })

    const updateStepType = (index: number, type: FilterTypeOrNone) =>
        setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, type } : s)))

    const updateStepParam = (index: number, key: keyof StepParams, value: number) =>
        setSteps((prev) =>
            prev.map((s, i) => (i === index ? { ...s, params: { ...s.params, [key]: value } } : s)),
        )

    const buildFilterChain = (): FilterStep[] =>
        steps.flatMap((s) => {
            const step = buildStep(s)
            return step ? [step] : []
        })

    const reset = () => setSteps([BLANK_STEP()])

    return {
        steps,
        addStep,
        removeStep,
        moveStep,
        updateStepType,
        updateStepParam,
        buildFilterChain,
        reset,
    }
}
