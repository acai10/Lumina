import { useRef } from 'react'
import React from 'react'
import { uploadH5 } from '../../shared/api/octAPI'
import type { H5Meta, H5UploadResponse } from '../../shared/types/viewer.types'

interface UseFileUploadParams {
    setStlFile: (f: File | null) => void
    setH5Data: (d: H5UploadResponse | null) => void
    setActiveFileName: (n: string) => void
    setErrorMsg: (m: string | null) => void
    setMode: (mode: 'none' | 'stl' | 'h5') => void
    setH5Meta: (meta: H5Meta) => void
    setIsLoading: (v: boolean) => void
}

export function useFileUpload({
    setStlFile,
    setH5Data,
    setActiveFileName,
    setErrorMsg,
    setMode,
    setH5Meta,
    setIsLoading,
}: UseFileUploadParams) {
    const stlInputRef = useRef<HTMLInputElement>(null)
    const h5InputRef = useRef<HTMLInputElement>(null)

    const handleSTLUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setErrorMsg(null)
        setStlFile(file)
        setActiveFileName(file.name)
        setMode('stl')
    }

    const handleH5Upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        e.target.value = ''
        setErrorMsg(null)
        setIsLoading(true)
        try {
            const data = await uploadH5(file)
            setH5Data(data)
            setH5Meta({ nSlices: data.nSlices, height: data.height, width: data.width })
            setActiveFileName(file.name)
            setMode('h5')
        } catch (err) {
            console.error('H5 upload failed:', err)
            setErrorMsg(err instanceof Error ? err.message : 'Upload failed.')
        } finally {
            setIsLoading(false)
        }
    }

    return { stlInputRef, h5InputRef, handleSTLUpload, handleH5Upload }
}
