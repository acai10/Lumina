import { useState } from 'react'
import type { FilterStep, FilterType } from '../../shared/api/types'

export type FilterTypeOrNone = FilterType | 'none'

export interface FilterParams {
    gaussianSigma: number
    medianRadius: number
    leeWindow: number
    bm3dSigma: number
    normalizeLow: number
    normalizeHigh: number
}

// Default filter parameters. Sizes align with the slider minima in
// RENDER_CONTROL_LIMITS (median/lee size must be >= 3 or the filter is a no-op).
const DEFAULT_PARAMS: FilterParams = {
    gaussianSigma: 1.5,
    medianRadius: 3,
    leeWindow: 3,
    bm3dSigma: 0.1,
    normalizeLow: 2.0,
    normalizeHigh: 98.0,
}

export function useFilterParams() {
    const [type, setType] = useState<FilterTypeOrNone>('none')
    // One object holding every param value: switching `type` keeps previously
    // entered values for the other filters (they are simply not read).
    const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS)

    const updateParam = <K extends keyof FilterParams>(key: K, value: number) =>
        setParams((prev) => ({ ...prev, [key]: value }))

    const buildFilterStep = (): FilterStep[] => {
        switch (type) {
            case 'gaussian':
                return [{ type: 'gaussian', params: { sigma: params.gaussianSigma } }]
            case 'median':
                return [{ type: 'median', params: { size: params.medianRadius } }]
            case 'lee':
                return [{ type: 'lee', params: { window: params.leeWindow } }]
            case 'bm3d':
                return [{ type: 'bm3d', params: { sigma_psd: params.bm3dSigma } }]
            case 'normalize':
                return [
                    {
                        type: 'normalize',
                        params: {
                            low_percentile: params.normalizeLow,
                            high_percentile: params.normalizeHigh,
                        },
                    },
                ]
            case 'anisotropy':
                return [{ type: 'anisotropy', params: {} }]
            default:
                return []
        }
    }

    return { type, setType, params, updateParam, buildFilterStep }
}
