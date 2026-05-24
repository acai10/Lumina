import { useState } from 'react'
import { uploadVolume, createJob, pollJob, fetchResultVolume } from '../../shared/api/client'
import { normalizeVolume } from '../../shared/h5/h5Normalizer'
import { loadH5FileInWorker, PRE_FILTER_THRESHOLD } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { FilterStep } from '../../shared/api/types'

export type FilterPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'reverting'

const POLL_INTERVAL_MS = 2_000

export function useFilterJob(fileKey: string, sourceFile: File) {
    const { setFilteringState, applyBackendFilter, setNotification } = useViewerStore()

    const [phase, setPhase] = useState<FilterPhase>('idle')
    const [error, setError] = useState<string | null>(null)

    const isBusy = phase !== 'idle'

    const run = async (filterChain: FilterStep[]) => {
        setError(null)
        setFilteringState(fileKey, true)

        try {
            setPhase('uploading')
            const { volume_id } = await uploadVolume(sourceFile)

            const { job_id } = await createJob({
                volume_id,
                filter_chain: filterChain,
                stitchers: ['phase_correlation'],
            })

            setPhase('processing')
            let jobStatus = await pollJob(job_id)
            while (jobStatus.status === 'pending' || jobStatus.status === 'running') {
                await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
                jobStatus = await pollJob(job_id)
            }
            if (jobStatus.status === 'error') {
                throw new Error(jobStatus.error ?? 'Job failed')
            }

            setPhase('downloading')
            const { data, shape } = await fetchResultVolume(job_id, 'phase_correlation')
            const newData = normalizeVolume(data, shape, PRE_FILTER_THRESHOLD)
            applyBackendFilter(fileKey, newData)
            setNotification({ message: 'Filter applied', severity: 'success' })
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setPhase('idle')
            setFilteringState(fileKey, false)
        }
    }

    const revert = async () => {
        setError(null)
        setFilteringState(fileKey, true)
        try {
            setPhase('reverting')
            const originalData = await loadH5FileInWorker(sourceFile)
            applyBackendFilter(fileKey, originalData)
            setNotification({ message: 'Filter reverted', severity: 'info' })
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setPhase('idle')
            setFilteringState(fileKey, false)
        }
    }

    return { phase, error, isBusy, run, revert, clearError: () => setError(null) }
}
