import { useEffect, useRef, useState } from 'react'
import { createSession, pollSession, fetchSessionMerged, uploadVolume } from '../../shared/api'
import { pollUntilDone } from '../../shared/api/pollUntilDone'
import type { CancelToken } from '../../shared/api/pollUntilDone'
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

const BUSY_PHASES: ReadonlySet<StitchPhase> = new Set(['uploading', 'processing', 'downloading'])

/** Disambiguates result-tab names when two runs finish within the same second. */
let stitchRunCounter = 0

export function useStitchSession() {
    const loadH5 = useViewerStore((s) => s.loadH5)
    const [phase, setPhase] = useState<StitchPhase>('idle')
    const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null)
    const [error, setError] = useState<string | null>(null)
    const tokenRef = useRef<CancelToken | null>(null)

    // Stop the poll loop and all state writes when the panel unmounts.
    useEffect(() => {
        return () => {
            if (tokenRef.current) tokenRef.current.cancelled = true
        }
    }, [])

    const run = async (configs: VolumeConfig[], method: RegistrationMethod): Promise<void> => {
        if (BUSY_PHASES.has(phase)) return
        const token: CancelToken = { cancelled: false }
        tokenRef.current = token
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
            if (token.cancelled) return

            setPhase('processing')
            const { session_id } = await createSession({
                volumes: entries,
                method,
                method_params: {},
            })

            const status = await pollUntilDone(() => pollSession(session_id), token)
            if (!status) return // cancelled
            setSessionStatus(status)

            if (status.status === JOB_STATUS.ERROR) {
                throw new Error(status.error ?? 'Session failed')
            }

            // fetchSessionMerged now returns H5VolumeData directly from the backend —
            // no Web Worker or JS normalization step needed.
            setPhase('downloading')
            const volumeData = await fetchSessionMerged(session_id)
            if (token.cancelled) return

            const entry: H5FileEntry = {
                name: `Stitched #${++stitchRunCounter} (${new Date().toLocaleTimeString()})`,
                data: volumeData,
                backendVolumeId: session_id,
            }
            await loadH5([entry])
            setPhase('done')
        } catch (err) {
            if (token.cancelled) return
            setError(err instanceof Error ? err.message : String(err))
            setPhase('error')
        }
    }

    const reset = () => {
        if (tokenRef.current) tokenRef.current.cancelled = true
        setPhase('idle')
        setSessionStatus(null)
        setError(null)
    }

    return { phase, sessionStatus, error, run, reset }
}
