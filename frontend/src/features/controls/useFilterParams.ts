import type { FilterStep } from '../../shared/api/types'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { FilterTypeOrNone, PipelineStep, StepParams } from '../../shared/types/viewer.types'

export type { FilterTypeOrNone, PipelineStep, StepParams } from '../../shared/types/viewer.types'

const DEFAULT_STEP_PARAMS: StepParams = {
    gaussianSigma: 1.5,
    medianRadius: 3,
    meanSize: 3,
    normalizeLow: 2.0,
    normalizeHigh: 98.0,
}

const BLANK_STEP = (): PipelineStep => ({
    type: 'none',
    params: { ...DEFAULT_STEP_PARAMS },
})

/** Shared empty pipeline for tabs that have not configured any steps yet. A stable
 *  reference preserves Zustand snapshot equality; deep-frozen so this shared default
 *  can never be mutated in place — every mutation below commits a fresh array. */
const INITIAL_STEPS: PipelineStep[] = [BLANK_STEP()]
Object.freeze(INITIAL_STEPS[0].params)
Object.freeze(INITIAL_STEPS[0])
Object.freeze(INITIAL_STEPS)

/** Build a `FilterStep` from a `PipelineStep`, or `null` for type === 'none'. */
function buildStep(step: PipelineStep): FilterStep | null {
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
            return { type: 'edge', params: {} }
        default:
            return null
    }
}

/**
 * Per-tab preprocessing pipeline. The steps live in the viewer store keyed by
 * `fileKey`, so selecting a filter in one tab and switching tabs no longer carries
 * that selection over — each tab keeps its own pipeline.
 */
export function usePipeline(fileKey: string) {
    const steps = useViewerStore((s) => s.h5PerFileStates[fileKey]?.filterSteps) ?? INITIAL_STEPS
    const setFilterSteps = useViewerStore((s) => s.setFilterSteps)
    const commit = (next: PipelineStep[]) => setFilterSteps(fileKey, next)

    const addStep = () => commit([...steps, BLANK_STEP()])

    const removeStep = (index: number) => commit(steps.filter((_, i) => i !== index))

    const moveStep = (index: number, direction: 'up' | 'down') => {
        const next = [...steps]
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= next.length) return
        ;[next[index], next[target]] = [next[target], next[index]]
        commit(next)
    }

    const updateStepType = (index: number, type: FilterTypeOrNone) =>
        commit(steps.map((s, i) => (i === index ? { ...s, type } : s)))

    const updateStepParam = (index: number, key: keyof StepParams, value: number) =>
        commit(
            steps.map((s, i) =>
                i === index ? { ...s, params: { ...s.params, [key]: value } } : s,
            ),
        )

    const buildFilterChain = (): FilterStep[] =>
        steps.flatMap((s) => {
            const step = buildStep(s)
            return step ? [step] : []
        })

    const reset = () => commit([BLANK_STEP()])

    return {
        pipeline: { steps, addStep, removeStep, moveStep, updateStepType, updateStepParam, reset },
        buildFilterChain,
    }
}
