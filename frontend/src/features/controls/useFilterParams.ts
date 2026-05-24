import { useState } from 'react'
import type { FilterStep, FilterType } from '../../shared/api/types'

export type FilterTypeOrNone = FilterType | 'none'

export function useFilterParams() {
    const [filterType, setFilterType] = useState<FilterTypeOrNone>('none')
    const [gaussianSigma, setGaussianSigma] = useState(1.5)
    const [medianRadius, setMedianRadius] = useState(1)
    const [leeWindow, setLeeWindow] = useState(3)
    const [bm3dSigma, setBm3dSigma] = useState(0.1)
    const [normalizeLow, setNormalizeLow] = useState(2.0)
    const [normalizeHigh, setNormalizeHigh] = useState(98.0)

    const buildFilterStep = (): FilterStep[] => {
        if (filterType === 'none') return []
        const params: Record<string, unknown> = (() => {
            switch (filterType) {
                case 'gaussian':
                    return { sigma: gaussianSigma }
                case 'median':
                    return { radius: medianRadius }
                case 'lee':
                    return { window_size: leeWindow }
                case 'bm3d':
                    return { sigma_psd: bm3dSigma }
                case 'normalize':
                    return { low_percentile: normalizeLow, high_percentile: normalizeHigh }
                default:
                    return {}
            }
        })()
        return [{ type: filterType, params }]
    }

    return {
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
    }
}
