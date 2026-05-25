import { useState } from 'react'
import { createSession, pollSession, fetchSessionMerged, uploadVolume } from '../../shared/api'
import type { RegistrationMethod, SessionStatus } from '../../shared/api'
import { PRE_FILTER_THRESHOLD } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry, H5VolumeData } from '../../shared/types/viewer.types'

export type StitchPhase = 'idle' | 'uploading' | 'processing' | 'downloading' | 'done' | 'error'

export interface VolumeConfig {
    file: File
    row: number
    col: number
    volumeId?: string
}

const POLL_INTERVAL_MS = 2_000

function normalizeInWorker(
    raw: Float32Array,
    shape: [number, number, number],
): Promise<H5VolumeData> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../../shared/h5/h5.worker.ts', import.meta.url), {
            type: 'module',
        })
        worker.onmessage = (e) => {
            worker.terminate()
            if (e.data.ok) resolve(e.data.result as H5VolumeData)
            else reject(new Error(e.data.error))
        }
        worker.onerror = (err) => {
            worker.terminate()
            reject(new Error(err.message))
        }
        worker.postMessage(
            { raw, dims: shape, threshold: PRE_FILTER_THRESHOLD, skipNormalizedVolume: true },
            [raw.buffer],
        )
    })
}

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

            setPhase('downloading')
            const { data, shape } = await fetchSessionMerged(session_id)
            const volumeData = await normalizeInWorker(data, shape)

            const entry: H5FileEntry = {
                name: `Stitched (${new Date().toLocaleTimeString()})`,
                data: volumeData,
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
