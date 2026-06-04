import { useState } from 'react'
import { createSession, pollSession, fetchSessionMerged, uploadVolume } from '../../shared/api'
import type { RegistrationMethod, SessionStatus } from '../../shared/api'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry } from '../../shared/types/viewer.types'

export type StitchPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'done' | 'error'

export interface VolumeConfig {
    file: File
    row: number
    col: number
    volumeId?: string
}

const POLL_INTERVAL_MS = 2_000

export function useStitchSession() {
    const { loadH5 } = useViewerStore()
    const [phase, setPhase] = useState<StitchPhase>('idle')
    const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
    const [error, setError] = useState<string | null>(null)

    const run = async (configs: VolumeConfig[], method: RegistrationMethod) => {
        setError(null)
        setSessionStatus(null)

        try {
            setPhase('uploading')
            const entries = await Promise.all(
                configs.map(async (cfg) => {
                    const { volume_id } = await uploadVolume(cfg.file)
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
            while (status.status === 'pending' || status.status === 'running') {
                await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL_MS))
                status = await pollSession(session_id)
            }
            setSessionStatus(status)

            if (status.status === 'error') {
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
            loadH5([entry])
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
