import { useState } from 'react'
import {
    uploadVolume,
    createJob,
    pollJob,
    fetchResultVolume,
    filterSessionVolume,
    fetchSessionMerged,
} from '../../shared/api/client'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { FilterStep } from '../../shared/api/types'

export type FilterPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'reverting'

const POLL_INTERVAL_MS = 2_000

export function useFilterJob(fileKey: string, sourceFile?: File, backendVolumeId?: string) {
    const { setFilteringState, applyBackendFilter, setNotification } = useViewerStore(
        useShallow((s) => ({
            setFilteringState: s.setFilteringState,
            applyBackendFilter: s.applyBackendFilter,
            setNotification: s.setNotification,
        })),
    )

    const [phase, setPhase] = useState<FilterPhase>('idle')
    const [error, setError] = useState<string | null>(null)

    const isBusy = phase !== 'idle'

    const run = async (filterChain: FilterStep[]) => {
        setError(null)
        setFilteringState(fileKey, true)

        try {
            // ── Merged-result path: backend normalises, no worker needed ──────
            if (backendVolumeId) {
                setPhase('downloading')
                const newData = await filterSessionVolume(backendVolumeId, filterChain)
                applyBackendFilter(fileKey, newData)
                setNotification({ message: 'Filter applied', severity: 'success' })
                return
            }

            // ── Normal path: upload → job → poll → fetch pre-normalised result ─
            if (!sourceFile) return

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

            // fetchResultVolume now returns H5VolumeData directly — no worker.
            setPhase('downloading')
            const newData = await fetchResultVolume(job_id, 'phase_correlation')
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

            if (backendVolumeId) {
                // Reload the original merged volume — backend normalises, no worker.
                const originalData = await fetchSessionMerged(backendVolumeId)
                applyBackendFilter(fileKey, originalData)
            } else if (sourceFile) {
                // Local files still go through h5wasm → worker (no upload path).
                const originalData = await loadH5FileInWorker(sourceFile)
                applyBackendFilter(fileKey, originalData)
            }

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
