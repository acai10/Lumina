import { useState } from 'react'
import {
    fetchNormalizedVolume,
    filterSessionVolume,
    filterVolume,
    fetchSessionMerged,
} from '../../shared/api'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker } from '../../shared/h5'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useResolveVolumeId } from '../../shared/hooks'
import type { FilterStep } from '../../shared/api'

export type FilterPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'reverting'

export function useFilterJob(
    fileKey: string,
    sourceFile?: File,
    backendVolumeId?: string,
    registeredVolumeId?: string,
) {
    const {
        setFilteringState,
        applyBackendFilter,
        saveFilterSnapshot,
        setFilterApplied,
        setNotification,
    } = useViewerStore(
        useShallow((s) => ({
            setFilteringState: s.setFilteringState,
            applyBackendFilter: s.applyBackendFilter,
            saveFilterSnapshot: s.saveFilterSnapshot,
            setFilterApplied: s.setFilterApplied,
            setNotification: s.setNotification,
        })),
    )

    // Reuses (and caches) the tab's server volume id — a local file is uploaded
    // once, not on every apply. For stitched tabs `backendVolumeId` is a session
    // id, so those keep the dedicated merged path below (guarded on !sourceFile).
    const resolveVolumeId = useResolveVolumeId(fileKey, {
        registeredVolumeId,
        backendVolumeId,
        sourceFile,
    })

    const [phase, setPhase] = useState<FilterPhase>('idle')
    const [error, setError] = useState<string | null>(null)

    const isBusy = phase !== 'idle'

    const run = async (filterChain: FilterStep[]): Promise<void> => {
        setError(null)
        setFilteringState(fileKey, true)
        // Snapshot before the filter so before/after comparison is always available.
        saveFilterSnapshot(fileKey)

        try {
            // ── Merged-result path: backend normalises, no worker needed ──────
            // Only take this path for pure server-side session results (no local file,
            // no path-registered volume). backendVolumeId is also lazily set by
            // resolveVolumeId for local files used in segmentation — those must go
            // through the normal upload→job pipeline below.
            if (backendVolumeId && !sourceFile && !registeredVolumeId) {
                setPhase('downloading')
                const newData = await filterSessionVolume(backendVolumeId, filterChain)
                applyBackendFilter(fileKey, newData)
                setFilterApplied(fileKey, true)
                setNotification({ message: 'Filter applied', severity: 'success' })
                return
            }

            // ── Normal path: (upload once OR reuse registered volume) → filter ─
            // resolveVolumeId reuses a registered/already-uploaded id and only
            // uploads a fresh local file when needed, caching the result so a
            // second apply doesn't re-send ~128 MB. The /volumes/{id}/filter
            // endpoint returns the normalised result in one request — no stitcher,
            // no metrics, no polling, and the volume is not positionally altered.
            if (!registeredVolumeId && sourceFile) setPhase('uploading')
            const volume_id = await resolveVolumeId()
            if (!volume_id) return

            setPhase('processing')
            const newData = await filterVolume(volume_id, filterChain)
            applyBackendFilter(fileKey, newData)
            setFilterApplied(fileKey, true)
            setNotification({ message: 'Filter applied', severity: 'success' })
        } catch (err) {
            setFilterApplied(fileKey, false)
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

            if (backendVolumeId && !sourceFile && !registeredVolumeId) {
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

            setFilterApplied(fileKey, false)
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
