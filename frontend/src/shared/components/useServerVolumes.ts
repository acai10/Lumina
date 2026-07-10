import { useCallback, useState } from 'react'
import { listLocalVolumes } from '../api'
import type { LocalVolume } from '../api'

/**
 * Fetches the list of server-side `.h5` source files (under the backend's `data_dir`).
 *
 * Owns its own loading/error state. `refresh()` is safe to call either from an event
 * handler (e.g. opening a picker) or once from a mount effect for an initial load —
 * it performs no synchronous setState in the caller's render/commit path beyond
 * flipping the loading flag; the volume list is set later from the async result.
 */
export function useServerVolumes() {
    const [volumes, setVolumes] = useState<LocalVolume[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setVolumes(await listLocalVolumes())
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
        } finally {
            setLoading(false)
        }
    }, [])

    return { volumes, loading, error, refresh }
}
