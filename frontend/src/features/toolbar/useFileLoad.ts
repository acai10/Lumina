import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker, VOLUME_DIMS } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import { registerLocalVolume, fetchNormalizedVolume } from '../../shared/api'
import type { LocalVolume } from '../../shared/api'
import type { H5FileEntry } from '../../shared/types/viewer.types'

export function useFileLoad() {
    const { loadStlFiles, loadH5, setIsLoading, setNotification } = useViewerStore(
        useShallow((s) => ({
            loadStlFiles: s.loadStlFiles,
            loadH5: s.loadH5,
            setIsLoading: s.setIsLoading,
            setNotification: s.setNotification,
        })),
    )

    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)
    const h5FolderInputRef = useRef<HTMLInputElement>(null)

    const processH5Files = async (files: File[]) => {
        setIsLoading(true)
        let loaded = 0
        for (const f of files) {
            try {
                const data = await loadH5FileInWorker(f, VOLUME_DIMS)
                const entry: H5FileEntry = { name: f.name, data, sourceFile: f }
                // Await so each file is persisted + evicted before the next is read,
                // bounding peak heap to a few volumes during folder loads.
                await loadH5([entry])
                loaded++
            } catch (err) {
                console.error(`Failed to load ${f.name}:`, err)
                setNotification({
                    message: `Failed to load "${f.name}": ${err instanceof Error ? err.message : String(err)}`,
                    severity: 'error',
                })
            }
        }
        setIsLoading(false)
        if (loaded > 0) {
            setNotification({
                message: loaded === 1 ? 'File loaded' : `${loaded} files loaded`,
                severity: 'success',
            })
        }
    }

    const loadServerVolume = async (local: LocalVolume) => {
        setIsLoading(true)
        try {
            // Register the file by path (zero-copy symlink) — no bytes uploaded — then
            // fetch the backend-normalised, render-ready volume (no h5wasm worker).
            const { volume_id } = await registerLocalVolume(local.path)
            const data = await fetchNormalizedVolume(volume_id)
            const entry: H5FileEntry = { name: local.name, data, registeredVolumeId: volume_id }
            await loadH5([entry])
            setNotification({ message: 'File loaded', severity: 'success' })
        } catch (err) {
            setNotification({
                message: `Failed to load "${local.name}": ${err instanceof Error ? err.message : String(err)}`,
                severity: 'error',
            })
        } finally {
            setIsLoading(false)
        }
    }

    /** Route drag-and-dropped files to the right loader, split by extension. */
    const loadDroppedFiles = (files: File[]) => {
        const h5 = files.filter((f) => f.name.toLowerCase().endsWith('.h5'))
        const stl = files.filter((f) => f.name.toLowerCase().endsWith('.stl'))
        if (stl.length > 0) loadStlFiles(stl)
        if (h5.length > 0) void processH5Files(h5)
        if (h5.length === 0 && stl.length === 0) {
            setNotification({ message: 'Drop .h5 or .stl files', severity: 'info' })
        }
    }

    const handleSTLLoad = (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (files.length === 0) return
        loadStlFiles(files)
    }

    const handleH5Load = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (files.length === 0) return
        await processH5Files(files)
    }

    const handleH5FolderLoad = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).filter(
            (f) =>
                f.name.toLowerCase().endsWith('.h5') &&
                f.webkitRelativePath.split('/').length === 2,
        )
        e.target.value = ''
        if (files.length === 0) return
        await processH5Files(files)
    }

    return {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLLoad,
        handleH5Load,
        handleH5FolderLoad,
        loadServerVolume,
        // Imperative loaders for drag-and-drop / the empty-state dropzone.
        loadH5Files: processH5Files,
        loadStlFiles,
        loadDroppedFiles,
    }
}
