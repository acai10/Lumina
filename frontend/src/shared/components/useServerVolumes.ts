import { useRef, useState } from 'react'
import { listLocalVolumes } from '../api'
import type { LocalVolume } from '../api'

/**
 * Fetches the list of server-side `.h5` source files (under the backend's `data_dir`).
 *
 * Owns its own loading/error state. Call `refresh()` from an event handler (e.g. when
 * opening a picker) — not from an effect — so we never trigger a synchronous setState
 * inside an effect body.
 */
export function useServerVolumes() {
    const [volumes, setVolumes] = useState<LocalVolume[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Overlapping refreshes can resolve out of order — only the latest request
    // may write state, so a stale response never overwrites a fresher list.
    const requestIdRef = useRef(0)

    const refresh = async () => {
        const id = ++requestIdRef.current
        setLoading(true)
        setError(null)
        try {
            const list = await listLocalVolumes()
            if (id !== requestIdRef.current) return
            setVolumes(list)
        } catch (err) {
            if (id !== requestIdRef.current) return
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            if (id === requestIdRef.current) setLoading(false)
        }
    }

    return { volumes, loading, error, refresh }
}
