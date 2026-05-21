import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { uploadH5 } from '../../shared/api/octAPI'
import type { H5Meta, H5UploadResponse } from '../../shared/types/viewer.types'

export interface H5FileEntry {
    name: string
    data: H5UploadResponse
}

interface UseFileUploadParams {
    setStlFile: (f: File | null) => void
    setH5Files: (files: H5FileEntry[]) => void
    setActiveFileName: (n: string) => void
    setErrorMsg: (m: string | null) => void
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setH5Meta: (meta: H5Meta) => void
    setIsLoading: (v: boolean) => void
    setCurrentSliceIndex: (i: number | null) => void
}

export function useFileUpload({
    setStlFile,
    setH5Files,
    setActiveFileName,
    setErrorMsg,
    setMode,
    setH5Meta,
    setIsLoading,
    setCurrentSliceIndex,
}: UseFileUploadParams) {
    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)
    const h5FolderInputRef = useRef<HTMLInputElement>(null)

    const _performH5Upload = async (uploadFn: () => Promise<H5FileEntry[]>) => {
        setErrorMsg(null)
        setIsLoading(true)
        setCurrentSliceIndex(null)
        try {
            const results = await uploadFn()
            setH5Files(results)
            setH5Meta({ nSlices: results[0].data.nSlices, height: results[0].data.height, width: results[0].data.width })
            setActiveFileName(results[0].name)
            setMode('h5')
        } catch (err) {
            console.error('H5 upload failed:', err)
            setErrorMsg(err instanceof Error ? err.message : 'Upload failed.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSTLUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setErrorMsg(null)
        setStlFile(file)
        setActiveFileName(file.name)
        setMode('stl')
    }

    const handleH5Upload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        // Reset allows re-selecting the same file in subsequent uploads
        e.target.value = ''
        await _performH5Upload(async () => [{ name: file.name, data: await uploadH5(file) }])
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

    return { stlInputRef, h5InputRef, h5FolderInputRef, handleSTLUpload, handleH5Upload, handleH5FolderUpload }
}
