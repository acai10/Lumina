import { useState } from 'react'
import { createSession, pollSession, fetchSessionMerged, uploadVolume } from '../../shared/api'
import { JOB_STATUS } from '../../shared/api/types'
import type { RegistrationMethod, SessionStatus } from '../../shared/api'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry } from '../../shared/types/viewer.types'

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

    const run = async (configs: VolumeConfig[], method: RegistrationMethod): Promise<void> => {
        setError(null)
        setSessionStatus(null)

        try {
            setPhase('uploading')
            const entries = await Promise.all(
                configs.map(async (cfg) => {
                    // Server-registered volumes already live on the backend by path —
                    // skip the upload; only local files are uploaded.
                    let volume_id: string
                    if (cfg.volumeId) {
                        volume_id = cfg.volumeId
                    } else if (cfg.file) {
                        volume_id = (await uploadVolume(cfg.file)).volume_id
                    } else {
                        throw new Error(`Volume "${cfg.name}" has neither a file nor an id`)
                    }
                    return { volume_id, row: cfg.row, col: cfg.col }
                }),
            )

            setPhase('processing')
            const { session_id } = await createSession({
                volumes: entries,
                method,
                method_params: {},
            })

            let status = await pollSession(session_id)
            while (status.status === JOB_STATUS.PENDING || status.status === JOB_STATUS.RUNNING) {
                await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL_MS))
                status = await pollSession(session_id)
            }
            setSessionStatus(status)

            if (status.status === JOB_STATUS.ERROR) {
                throw new Error(status.error ?? 'Session failed')
            }

            // fetchSessionMerged now returns H5VolumeData directly from the backend —
            // no Web Worker or JS normalization step needed.
            setPhase('downloading')
            const volumeData = await fetchSessionMerged(session_id)

            const entry: H5FileEntry = {
                name: `Stitched (${new Date().toLocaleTimeString()})`,
                data: volumeData,
                backendVolumeId: session_id,
            }
            await loadH5([entry])
            setPhase('done')
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            setPhase('error')
        }
    }

    const reset = () => {
        setPhase('idle')
        setSessionStatus(null)
        setError(null)
    }

    return { phase, sessionStatus, error, run, reset }
}
