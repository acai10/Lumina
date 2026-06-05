import { useState } from 'react'
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

    const refresh = async () => {
        setLoading(true)
        setError(null)
        try {
            setVolumes(await listLocalVolumes())
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }

    return { volumes, loading, error, refresh }
}
