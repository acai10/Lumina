import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { loadH5FileInWorker } from '../../shared/h5/h5Reader'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry } from '../../shared/types/viewer.types'

export function useFileLoad() {
    const { setMode, setStlFile, loadH5, setIsLoading, setNotification } = useViewerStore()

    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)
    const h5FolderInputRef = useRef<HTMLInputElement>(null)

    const processH5Files = async (files: File[]) => {
        setIsLoading(true)
        try {
            const results: H5FileEntry[] = await Promise.all(
                files.map(async (f) => ({
                    name: f.name,
                    data: await loadH5FileInWorker(f, [512, 250, 250]),
                })),
            )
            loadH5(results)
            setNotification({
                message: results.length === 1 ? 'File loaded' : `${results.length} files loaded`,
                severity: 'success',
            })
        } catch (err) {
            console.error('H5 processing failed:', err)
            setNotification({
                message: err instanceof Error ? err.message : 'Failed to load file.',
                severity: 'error',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleSTLLoad = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setStlFile(file)
        setMode('stl')
    }

    const handleH5Load = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        e.target.value = ''
        if (files.length === 0) return
        await processH5Files(files)
    }

    const handleH5FolderLoad = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).filter((f) =>
            f.name.toLowerCase().endsWith('.h5'),
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
