import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { uploadH5 } from '../../shared/api/octAPI'
import { useViewerStore } from '../../app/store/viewerSlice'
import type { H5FileEntry } from '../../shared/types/viewer.types'

export function useFileUpload() {
    const { setMode, setStlFile, loadH5, setIsLoading, setNotification } = useViewerStore()

    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)
    const h5FolderInputRef = useRef<HTMLInputElement>(null)

    const _performH5Upload = async (uploadFn: () => Promise<H5FileEntry[]>) => {
        setIsLoading(true)
        try {
            const results = await uploadFn()
            loadH5(results)
            setNotification({
                message: results.length === 1 ? 'File added' : `${results.length} files added`,
                severity: 'success',
            })
        } catch (err) {
            console.error('H5 upload failed:', err)
            setNotification({
                message: err instanceof Error ? err.message : 'Upload failed.',
                severity: 'error',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleSTLUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setStlFile(file)
        setMode('stl')
    }

    const handleH5Upload = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? [])
        if (files.length === 0) return
        e.target.value = ''
        await _performH5Upload(() =>
            Promise.all(files.map(async (f) => ({ name: f.name, data: await uploadH5(f) }))),
        )
    }

    const handleH5FolderUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const all = Array.from(e.target.files ?? []).filter((f) =>
            f.name.toLowerCase().endsWith('.h5'),
        )
        e.target.value = ''
        if (all.length === 0) return
        await _performH5Upload(() =>
            Promise.all(all.map(async (f) => ({ name: f.name, data: await uploadH5(f) }))),
        )
    }

    return {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLUpload,
        handleH5Upload,
        handleH5FolderUpload,
    }
}
