import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore, fullVolumeCropBox } from '../../app/store/viewerSlice'
import { cropVolume, fetchNormalizedVolume, uploadVolume } from '../../shared/api/client'
import type { H5FileEntry, H5TabEntry } from '../../shared/types/viewer.types'
import { DEFAULT_VOXEL_SIZE_UM, UM_PER_MM } from '../../shared/constants'

/**
 * The "Open Crop" workflow, shared by the crop panel and the annotation toolbar:
 * resolve the source volume id, extract the current crop box server-side, optionally
 * apply a cylindrical mask (circle crop), and open the result as a new independent tab
 * — identical in behaviour to a freshly loaded file.
 */
export function useOpenCrop(activeH5: H5TabEntry) {
    const fileKey = activeH5.name
    const { rawCropBox, cropShape, voxelSizeUm } = useViewerStore(
        useShallow((s) => ({
            rawCropBox: s.h5PerFileStates[fileKey]?.cropBox,
            cropShape: s.h5PerFileStates[fileKey]?.cropShape ?? 'rect',
            voxelSizeUm: s.h5PerFileStates[fileKey]?.sliceVoxelSizeUm ?? DEFAULT_VOXEL_SIZE_UM,
        })),
    )
    const loadH5 = useViewerStore((s) => s.loadH5)
    const setIsLoading = useViewerStore((s) => s.setIsLoading)
    const setNotification = useViewerStore((s) => s.setNotification)
    const setBackendVolumeId = useViewerStore((s) => s.setBackendVolumeId)
    const setCropMode = useViewerStore((s) => s.setCropMode)
    const nextCropNumber = useViewerStore((s) => s.nextCropNumber)

    const [isCropping, setIsCropping] = useState(false)

    const cropBox = rawCropBox ?? fullVolumeCropBox(activeH5.meta)

    const resolveVolumeId = async (): Promise<string | null> => {
        const existing = activeH5.registeredVolumeId ?? activeH5.backendVolumeId
        if (existing) return existing
        if (!activeH5.sourceFile) return null
        const { volume_id } = await uploadVolume(activeH5.sourceFile)
        setBackendVolumeId(fileKey, volume_id)
        return volume_id
    }

    const openCrop = async (): Promise<void> => {
        setIsCropping(true)
        setIsLoading(true)
        try {
            const sourceId = await resolveVolumeId()
            if (!sourceId) {
                setNotification({
                    message: 'No volume source to crop',
                    severity: 'error',
                })
                return
            }
            // The shape mask is baked into the stored crop server-side, so the result
            // (and any later filtering of it) stays within the cylinder/sphere.
            const backendShape =
                cropShape === 'circle' ? 'cylinder' : cropShape === 'sphere' ? 'sphere' : 'rect'
            const {
                volume_id,
                n_slices,
                height: h,
                width: w,
            } = await cropVolume(sourceId, cropBox, backendShape)
            const data = await fetchNormalizedVolume(volume_id)

            const [dz, dy, dx] = voxelSizeUm
            const sizeMm: [number, number, number] = [
                (cropBox.w * dx) / UM_PER_MM,
                (cropBox.h * dy) / UM_PER_MM,
                (cropBox.d * dz) / UM_PER_MM,
            ]
            const num = nextCropNumber()
            const src = activeH5.name.replace(/\.h5$/i, '')
            const shapeTag = cropShape === 'circle' ? ' ⌀' : cropShape === 'sphere' ? ' ◯' : ''
            const mm = `${sizeMm[0].toFixed(2)}×${sizeMm[1].toFixed(2)}×${sizeMm[2].toFixed(2)}mm`
            const name = `Crop ${num}${shapeTag}: ${src} [x${cropBox.x}–${cropBox.x + cropBox.w}, y${cropBox.y}–${cropBox.y + cropBox.h}, z${cropBox.z}–${cropBox.z + cropBox.d}] ${mm}`
            // Register as a standalone stored volume (registeredVolumeId) so filtering,
            // measurement and re-cropping all work — full parity with a loaded file.
            const entry: H5FileEntry = { name, data, registeredVolumeId: volume_id }
            await loadH5([entry])
            setCropMode(fileKey, false)
            setNotification({
                message: `Crop opened (${w}×${h}×${n_slices}${cropShape === 'circle' ? ', cylindrical' : cropShape === 'sphere' ? ', spherical' : ''})`,
                severity: 'success',
            })
        } catch (err) {
            setNotification({
                message: err instanceof Error ? err.message : 'Crop failed',
                severity: 'error',
            })
        } finally {
            setIsCropping(false)
            setIsLoading(false)
        }
    }

    return { openCrop, isCropping }
}
