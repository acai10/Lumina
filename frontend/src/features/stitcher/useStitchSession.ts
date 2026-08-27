import { useEffect, useRef, useState } from 'react'
import {
    createSession,
    pollSession,
    fetchSessionMerged,
    uploadVolume,
    JOB_STATUS,
} from '../../shared/api'
import type { RegistrationMethod, SessionStatus } from '../../shared/api'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry } from '../../shared/types/viewer.types'

/**
 * Drives one multi-volume stitching session end to end.
 *
 * Uploads or registers the selected tiles, creates the session, polls it until the
 * backend reports DONE or ERROR, then downloads the merged volume and opens it as a
 * new tab. The polling interval and the cleanup of the timer on unmount live here so
 * the panel component stays pure layout.
 */
export type StitchPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'done' | 'error'

export interface VolumeConfig {
    name: string
    row: number
    col: number
    // Exactly one source is set: a local `file` to upload, or an already-registered
    // server-side `volumeId` (path-based, no upload).
    file?: File
    volumeId?: string
}

const POLL_INTERVAL_MS = 2_000

export function useStitchSession() {
    const loadH5 = useViewerStore((s) => s.loadH5)
    const [phase, setPhase] = useState<StitchPhase>('idle')
    const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
    const [error, setError] = useState<string | null>(null)
    const abortRef = useRef<AbortController | null>(null)

    // Abort any in-flight session (polling loop, uploads, download) when the hook
    // unmounts — e.g. the stitcher panel is closed — so it stops polling and never
    // sets state on an unmounted component.
    useEffect(() => () => abortRef.current?.abort(), [])

    const run = async (configs: VolumeConfig[], method: RegistrationMethod): Promise<void> => {
        // Cancel any previous in-flight run before starting a new one.
        abortRef.current?.abort()
        const abort = new AbortController()
        abortRef.current = abort
        const { signal } = abort

        setError(null)
        setSessionStatus(null)

        try {
            setPhase('uploading')
            // Upload tiles sequentially, not via Promise.all: a 25-tile grid at
            // ~128 MB each would otherwise buffer several GB of FormData at once
            // (the rest of the app deliberately loads volumes one at a time to
            // avoid OOM). Server-registered tiles skip the upload entirely.
            const entries: { volume_id: string; row: number; col: number }[] = []
            for (const cfg of configs) {
                if (signal.aborted) return
                let volume_id: string
                if (cfg.volumeId) {
                    volume_id = cfg.volumeId
                } else if (cfg.file) {
                    volume_id = (await uploadVolume(cfg.file, signal)).volume_id
                } else {
                    throw new Error(`Volume "${cfg.name}" has neither a file nor an id`)
                }
                entries.push({ volume_id, row: cfg.row, col: cfg.col })
            }
            if (signal.aborted) return

            setPhase('processing')
            const { session_id } = await createSession(
                { volumes: entries, method, method_params: {} },
                signal,
            )
            if (signal.aborted) return

            let status = await pollSession(session_id, signal)
            while (status.status === JOB_STATUS.PENDING || status.status === JOB_STATUS.RUNNING) {
                await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL_MS))
                if (signal.aborted) return
                status = await pollSession(session_id, signal)
            }
            setSessionStatus(status)

            if (status.status === JOB_STATUS.ERROR) {
                throw new Error(status.error ?? 'Session failed')
            }

            // fetchSessionMerged now returns H5VolumeData directly from the backend —
            // no Web Worker or JS normalization step needed.
            setPhase('downloading')
            const volumeData = await fetchSessionMerged(session_id, signal)
            if (signal.aborted) return

            const entry: H5FileEntry = {
                name: `Stitched (${new Date().toLocaleTimeString()})`,
                data: volumeData,
                backendVolumeId: session_id,
                // merged_volume_id is the proper /volumes/{id} key for the merged .h5
                // file created by the backend. It must be stored as registeredVolumeId
                // so that segmentation, measurement, and the filter-job pipeline all
                // hit the correct /volumes/{id}/... endpoints instead of the session
                // endpoint which is only valid for the session-filter fast path.
                registeredVolumeId: status.merged_volume_id ?? undefined,
            }
            await loadH5([entry])
            setPhase('done')
        } catch (err) {
            // AbortError is expected when the user resets mid-run — not an error.
            if (err instanceof Error && err.name === 'AbortError') return
            setError(err instanceof Error ? err.message : String(err))
            setPhase('error')
        }
    }

    const reset = () => {
        abortRef.current?.abort()
        abortRef.current = null
        setPhase('idle')
        setSessionStatus(null)
        setError(null)
    }

    return { phase, sessionStatus, error, run, reset }
}
