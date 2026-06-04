import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { loadH5FileInWorker, VOLUME_DIMS } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
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
    }
}
