import { useCallback } from 'react'
import { useViewerStore } from '../../app/store/viewerSlice'
import { uploadVolume } from '../api'

/** The fields of an H5 tab needed to locate (or lazily create) its server volume. */
export interface VolumeIdentity {
    registeredVolumeId?: string
    backendVolumeId?: string
    sourceFile?: File
}

/**
 * Resolve the server-side volume id for a tab, shared by the controls panel,
 * crop, filtering and any other server operation.
 *
 * A registered/already-uploaded volume is reused as-is; a local file is uploaded
 * exactly once and its id cached back into the store via `setBackendVolumeId`, so
 * repeated operations (measure, then filter, then segment …) never re-upload the
 * same ~128 MB file. Returns `null` when the tab has neither a server volume nor
 * a local source.
 */
export function useResolveVolumeId(
    fileKey: string | null | undefined,
    identity: VolumeIdentity,
): () => Promise<string | null> {
    const setBackendVolumeId = useViewerStore((s) => s.setBackendVolumeId)
    const { registeredVolumeId, backendVolumeId, sourceFile } = identity
    return useCallback(async () => {
        const existing = registeredVolumeId ?? backendVolumeId
        if (existing) return existing
        if (!sourceFile || !fileKey) return null
        const { volume_id } = await uploadVolume(sourceFile)
        setBackendVolumeId(fileKey, volume_id)
        return volume_id
    }, [fileKey, registeredVolumeId, backendVolumeId, sourceFile, setBackendVolumeId])
}
