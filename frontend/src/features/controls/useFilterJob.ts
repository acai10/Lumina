import { useState } from 'react'
import {
    uploadVolume,
    createJob,
    pollJob,
    fetchResultVolume,
    fetchNormalizedVolume,
    filterSessionVolume,
    fetchSessionMerged,
} from '../../shared/api/client'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import { JOB_STATUS, REGISTRATION_METHOD } from '../../shared/api/types'
import type { FilterStep } from '../../shared/api/types'

export type FilterPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'reverting'

const POLL_INTERVAL_MS = 2_000
/** Stitcher used for the single-volume filter pipeline (no real stitching happens). */
const DEFAULT_STITCHER = REGISTRATION_METHOD.PHASE_CORRELATION

export function useFilterJob(
    fileKey: string,
    sourceFile?: File,
    backendVolumeId?: string,
    registeredVolumeId?: string,
) {
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

    const run = async (filterChain: FilterStep[]): Promise<void> => {
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

            // ── Normal path: (upload OR reuse registered volume) → job → poll → fetch ─
            // A server-registered volume already lives on the backend by path, so we
            // skip the upload entirely and go straight to job creation.
            let volume_id: string
            if (registeredVolumeId) {
                volume_id = registeredVolumeId
            } else {
                if (!sourceFile) return
                setPhase('uploading')
                volume_id = (await uploadVolume(sourceFile)).volume_id
            }

            const { job_id } = await createJob({
                volume_id,
                filter_chain: filterChain,
                stitchers: [DEFAULT_STITCHER],
            })

            setPhase('processing')
            let jobStatus = await pollJob(job_id)
            while (
                jobStatus.status === JOB_STATUS.PENDING ||
                jobStatus.status === JOB_STATUS.RUNNING
            ) {
                await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
                jobStatus = await pollJob(job_id)
            }
            if (jobStatus.status === JOB_STATUS.ERROR) {
                throw new Error(jobStatus.error ?? 'Job failed')
            }

            // fetchResultVolume now returns H5VolumeData directly — no worker.
            setPhase('downloading')
            const newData = await fetchResultVolume(job_id, DEFAULT_STITCHER)
            applyBackendFilter(fileKey, newData)
            setNotification({ message: 'Filter applied', severity: 'success' })
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setPhase('idle')
            setFilteringState(fileKey, false)
        }
    }

    const revert = async (): Promise<void> => {
        setError(null)
        setFilteringState(fileKey, true)
        try {
            setPhase('reverting')

            if (backendVolumeId) {
                // Reload the original merged volume — backend normalises, no worker.
                const originalData = await fetchSessionMerged(backendVolumeId)
                applyBackendFilter(fileKey, originalData)
            } else if (registeredVolumeId) {
                // Re-fetch the unfiltered source by path — original file is never mutated.
                const originalData = await fetchNormalizedVolume(registeredVolumeId)
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
