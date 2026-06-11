import { useEffect, useRef, useState } from 'react'
import {
    uploadVolume,
    createJob,
    pollJob,
    fetchResultVolume,
    fetchNormalizedVolume,
    filterSessionVolume,
    fetchSessionMerged,
} from '../../shared/api/client'
import { pollUntilDone } from '../../shared/api/pollUntilDone'
import type { CancelToken } from '../../shared/api/pollUntilDone'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker } from '../../shared/h5'
import { useViewerStore } from '../../app/store/viewerSlice'
import { JOB_STATUS, REGISTRATION_METHOD } from '../../shared/api/types'
import type { FilterStep } from '../../shared/api/types'

export type FilterPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'reverting'

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
    const tokenRef = useRef<CancelToken | null>(null)

    // Cancel the in-flight pipeline on unmount so the poll loop stops and no
    // state is written afterwards. A tab *switch* does not cancel — the result
    // still applies to the correct tab via the closure's fileKey; only the
    // locally displayed phase/error reset so they never render under another
    // tab's controls (the per-tab spinner lives in the store via filteringState).
    useEffect(() => {
        return () => {
            if (tokenRef.current) tokenRef.current.cancelled = true
        }
    }, [])

    // Adjust-state-during-render pattern (not an effect): when the active tab
    // changes, the displayed phase/error must not carry over to the new tab.
    const [lastFileKey, setLastFileKey] = useState(fileKey)
    if (lastFileKey !== fileKey) {
        setLastFileKey(fileKey)
        setPhase('idle')
        setError(null)
    }

    const isBusy = phase !== 'idle'

    const run = async (filterChain: FilterStep[]): Promise<void> => {
        if (phase !== 'idle') return
        const token: CancelToken = { cancelled: false }
        tokenRef.current = token
        setError(null)
        setFilteringState(fileKey, true)

        try {
            // ── Merged-result path: backend normalises, no worker needed ──────
            if (backendVolumeId) {
                setPhase('downloading')
                const newData = await filterSessionVolume(backendVolumeId, filterChain)
                if (token.cancelled) return
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
                if (!sourceFile) throw new Error('No source available for this volume')
                setPhase('uploading')
                volume_id = (await uploadVolume(sourceFile)).volume_id
            }
            if (token.cancelled) return

            const { job_id } = await createJob({
                volume_id,
                filter_chain: filterChain,
                stitchers: [DEFAULT_STITCHER],
            })

            setPhase('processing')
            const jobStatus = await pollUntilDone(() => pollJob(job_id), token)
            if (!jobStatus) return // cancelled
            if (jobStatus.status === JOB_STATUS.ERROR) {
                throw new Error(jobStatus.error ?? 'Job failed')
            }

            // fetchResultVolume now returns H5VolumeData directly — no worker.
            setPhase('downloading')
            const newData = await fetchResultVolume(job_id, DEFAULT_STITCHER)
            if (token.cancelled) return
            applyBackendFilter(fileKey, newData)
            setNotification({ message: 'Filter applied', severity: 'success' })
        } catch (err) {
            if (!token.cancelled) setError(err instanceof Error ? err.message : String(err))
        } finally {
            setFilteringState(fileKey, false)
            if (!token.cancelled) setPhase('idle')
        }
    }

    const revert = async (): Promise<void> => {
        if (phase !== 'idle') return
        const token: CancelToken = { cancelled: false }
        tokenRef.current = token
        setError(null)
        setFilteringState(fileKey, true)
        try {
            setPhase('reverting')

            let originalData
            if (backendVolumeId) {
                // Reload the original merged volume — backend normalises, no worker.
                originalData = await fetchSessionMerged(backendVolumeId)
            } else if (registeredVolumeId) {
                // Re-fetch the unfiltered source by path — original file is never mutated.
                originalData = await fetchNormalizedVolume(registeredVolumeId)
            } else if (sourceFile) {
                // Local files still go through h5wasm → worker (no upload path).
                originalData = await loadH5FileInWorker(sourceFile)
            } else {
                throw new Error('No source available for this volume')
            }
            if (token.cancelled) return

            applyBackendFilter(fileKey, originalData)
            setNotification({ message: 'Filter reverted', severity: 'info' })
        } catch (err) {
            if (!token.cancelled) setError(err instanceof Error ? err.message : String(err))
        } finally {
            setFilteringState(fileKey, false)
            if (!token.cancelled) setPhase('idle')
        }
    }

    return { phase, error, isBusy, run, revert, clearError: () => setError(null) }
}
