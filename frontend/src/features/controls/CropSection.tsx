import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import Typography from '@mui/material/Typography'
import CropIcon from '@mui/icons-material/Crop'
import { useShallow } from 'zustand/react/shallow'
import {
    useViewerStore,
    fullVolumeCropBox,
    DEFAULT_CROP_THRESHOLD,
} from '../../app/store/viewerSlice'
import { cropVolume, fetchNormalizedVolume, uploadVolume } from '../../shared/api/client'
import type { CropBox, H5FileEntry, H5TabEntry } from '../../shared/types/viewer.types'
import { DEFAULT_VOXEL_SIZE_UM, UINT8_MAX, UM_PER_MM } from '../../shared/constants'
import { RangeSliderRow } from './SliderRow'
import { labelSx } from './ControlsPanel.styles'
import {
    analyzeRegionObjects,
    MIN_OBJECT_VOXELS,
    type CropObjectResult,
} from './cropObjectAnalysis'

/** Largest objects listed in the result panel before collapsing into "+N more". */
const OBJECT_LIST_LIMIT = 10

interface CropSectionProps {
    activeH5: H5TabEntry
}

/** Cap on voxels actually inspected for the signal readout (strided sampling). */
const SIGNAL_SAMPLE_BUDGET = 100_000

/**
 * Crop-selection controls: a box-edit toggle (enables the rectangle drag in the
 * 2D viewer and the live box in 3D), X/Y/Z range sliders, a physical-size readout,
 * a threshold-based signal-content readout for the selected region, and "Open Crop"
 * which extracts the sub-volume server-side and opens it as a new independent tab —
 * identical in behaviour to a freshly loaded file.
 */
export default function CropSection({ activeH5 }: CropSectionProps) {
    const fileKey = activeH5.name
    const { nSlices, height, width } = activeH5.meta
    const normalizedVolume = activeH5.data?.normalizedVolume ?? null

    const {
        cropMode,
        rawCropBox,
        cropThreshold,
        voxelSizeUm,
        setCropMode,
        setCropBox,
        setCropThreshold,
    } = useViewerStore(
        useShallow((s) => ({
            cropMode: s.h5PerFileStates[fileKey]?.cropMode ?? false,
            // Raw (possibly undefined) so useShallow keeps a stable reference; the
            // full-volume default is derived below to avoid a fresh object per render.
            rawCropBox: s.h5PerFileStates[fileKey]?.cropBox,
            cropThreshold: s.h5PerFileStates[fileKey]?.cropThreshold ?? DEFAULT_CROP_THRESHOLD,
            voxelSizeUm: s.h5PerFileStates[fileKey]?.sliceVoxelSizeUm ?? DEFAULT_VOXEL_SIZE_UM,
            setCropMode: s.setCropMode,
            setCropBox: s.setCropBox,
            setCropThreshold: s.setCropThreshold,
        })),
    )
    const cropBox = rawCropBox ?? fullVolumeCropBox(activeH5.meta)
    const loadH5 = useViewerStore((s) => s.loadH5)
    const setIsLoading = useViewerStore((s) => s.setIsLoading)
    const setNotification = useViewerStore((s) => s.setNotification)
    const setBackendVolumeId = useViewerStore((s) => s.setBackendVolumeId)
    const nextCropNumber = useViewerStore((s) => s.nextCropNumber)

    const [isCropping, setIsCropping] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    // Object result is tagged with the box/threshold it was computed for, so a
    // stale count is simply ignored at render when the selection changes — no effect.
    const [analysis, setAnalysis] = useState<{ key: string; result: CropObjectResult } | null>(null)

    const { x, y, z, w, h, d } = cropBox
    const analysisKey = `${x},${y},${z},${w},${h},${d},${cropThreshold}`
    const objectResult = analysis?.key === analysisKey ? analysis.result : null

    const handleAnalyzeObjects = () => {
        if (!normalizedVolume) return
        setIsAnalyzing(true)
        // Defer so the spinner paints before the (synchronous) flood fill runs.
        setTimeout(() => {
            const result = analyzeRegionObjects(
                normalizedVolume,
                activeH5.meta,
                cropBox,
                cropThreshold,
                voxelSizeUm,
            )
            setAnalysis({ key: analysisKey, result })
            setIsAnalyzing(false)
        }, 0)
    }

    // RangeSliderRow gives [lo, hi]; convert to origin + size, guarding hi > lo.
    const setAxis = (axis: 'x' | 'y' | 'z', [lo, hi]: [number, number]) => {
        const sizeKey = axis === 'x' ? 'w' : axis === 'y' ? 'h' : 'd'
        const next: CropBox = { ...cropBox, [axis]: lo, [sizeKey]: Math.max(1, hi - lo) }
        setCropBox(fileKey, next)
    }

    // Physical size of the selection in mm (voxelSizeUm is [dz, dy, dx] µm/vox).
    const [dz, dy, dx] = voxelSizeUm
    const sizeMm: [number, number, number] = [
        (cropBox.w * dx) / UM_PER_MM,
        (cropBox.h * dy) / UM_PER_MM,
        (cropBox.d * dz) / UM_PER_MM,
    ]

    // Signal content of the selected region at the chosen threshold — the
    // quantification carried over from the old segmentation tool. Sampled on a
    // stride so even a full-volume box stays well under a millisecond.
    const signal = useMemo(() => {
        if (!normalizedVolume) return null
        const { x, y, z, w, h, d } = cropBox
        const thr = Math.round(cropThreshold * UINT8_MAX)
        const sliceStride = height * width
        const totalVox = w * h * d
        const step = Math.max(1, Math.round(Math.cbrt(totalVox / SIGNAL_SAMPLE_BUDGET)))
        let sampled = 0
        let above = 0
        for (let zz = z; zz < z + d; zz += step) {
            for (let yy = y; yy < y + h; yy += step) {
                const rowBase = zz * sliceStride + yy * width
                for (let xx = x; xx < x + w; xx += step) {
                    sampled++
                    if (normalizedVolume[rowBase + xx] >= thr) above++
                }
            }
        }
        const fraction = sampled ? above / sampled : 0
        const aboveVoxEst = Math.round(fraction * totalVox)
        const signalMm3 = (aboveVoxEst * dz * dy * dx) / UM_PER_MM ** 3
        return { fraction, aboveVoxEst, signalMm3 }
    }, [normalizedVolume, cropBox, cropThreshold, height, width, dz, dy, dx])

    const isFullVolume =
        cropBox.x === 0 &&
        cropBox.y === 0 &&
        cropBox.z === 0 &&
        cropBox.w === width &&
        cropBox.h === height &&
        cropBox.d === nSlices

    const resolveVolumeId = async (): Promise<string | null> => {
        const existing = activeH5.registeredVolumeId ?? activeH5.backendVolumeId
        if (existing) return existing
        if (!activeH5.sourceFile) return null
        const { volume_id } = await uploadVolume(activeH5.sourceFile)
        setBackendVolumeId(fileKey, volume_id)
        return volume_id
    }

    const handleOpenCrop = async () => {
        setIsCropping(true)
        setIsLoading(true)
        try {
            const sourceId = await resolveVolumeId()
            if (!sourceId) {
                setNotification({
                    message: 'Keine Volumen-Quelle zum Zuschneiden',
                    severity: 'error',
                })
                return
            }
            const { volume_id, n_slices, height: h, width: w } = await cropVolume(sourceId, cropBox)
            const data = await fetchNormalizedVolume(volume_id)
            const num = nextCropNumber()
            const src = activeH5.name.replace(/\.h5$/i, '')
            const mm = `${sizeMm[0].toFixed(2)}×${sizeMm[1].toFixed(2)}×${sizeMm[2].toFixed(2)}mm`
            const name = `Crop ${num}: ${src} [x${cropBox.x}–${cropBox.x + cropBox.w}, y${cropBox.y}–${cropBox.y + cropBox.h}, z${cropBox.z}–${cropBox.z + cropBox.d}] ${mm}`
            const entry: H5FileEntry = { name, data, backendVolumeId: volume_id }
            await loadH5([entry])
            setCropMode(fileKey, false)
            setNotification({
                message: `Crop geöffnet (${w}×${h}×${n_slices})`,
                severity: 'success',
            })
        } catch (err) {
            setNotification({
                message: err instanceof Error ? err.message : 'Crop fehlgeschlagen',
                severity: 'error',
            })
        } finally {
            setIsCropping(false)
            setIsLoading(false)
        }
    }

    return (
        <Stack spacing={0.75}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>
                    ZUSCHNEIDEN
                </Typography>
                <ToggleButton
                    value="crop"
                    selected={cropMode}
                    size="small"
                    onChange={() => setCropMode(fileKey, !cropMode)}
                    sx={{ fontSize: '0.6rem', py: 0.2, px: 0.8, textTransform: 'none', margin: 1 }}
                >
                    <CropIcon sx={{ fontSize: 14, mr: 0.5 }} />
                </ToggleButton>
            </Stack>

            <RangeSliderRow
                label="X (Breite)"
                value={[cropBox.x, cropBox.x + cropBox.w]}
                min={0}
                max={width}
                step={1}
                onChange={(v) => setAxis('x', v)}
            />
            <RangeSliderRow
                label="Y (Slices)"
                value={[cropBox.z, cropBox.z + cropBox.d]}
                min={0}
                max={nSlices}
                step={1}
                onChange={(v) => setAxis('z', v)}
            />
            <RangeSliderRow
                label="Z (Tiefe)"
                value={[cropBox.y, cropBox.y + cropBox.h]}
                min={0}
                max={height}
                step={1}
                onChange={(v) => setAxis('y', v)}
            />

            <Typography sx={{ ...labelSx, opacity: 0.6, fontSize: '0.62rem' }}>
                {cropBox.w}×{cropBox.h}×{cropBox.d} vox · {sizeMm[0].toFixed(2)}×
                {sizeMm[1].toFixed(2)}×{sizeMm[2].toFixed(2)} mm
            </Typography>

            {/* Signal content of the selection — threshold + quantification carried
                over from the removed segmentation tool. */}
            {signal && (
                <Stack spacing={0.25}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography sx={{ ...labelSx, minWidth: 64 }}>Signal ≥</Typography>
                        <Slider
                            size="small"
                            value={cropThreshold}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(_, v) =>
                                setCropThreshold(fileKey, typeof v === 'number' ? v : v[0])
                            }
                            sx={{ flex: 1 }}
                        />
                        <Typography sx={{ ...labelSx, minWidth: 30, textAlign: 'right' }}>
                            {cropThreshold.toFixed(2)}
                        </Typography>
                    </Stack>
                    <Typography sx={{ ...labelSx, opacity: 0.6, fontSize: '0.62rem' }}>
                        {(signal.fraction * 100).toFixed(1)}% · ~
                        {signal.aboveVoxEst.toLocaleString()} vox · {signal.signalMm3.toFixed(4)}{' '}
                        mm³
                    </Typography>

                    {/* On-demand object-level analysis: distinct connected structures
                        in the region at the threshold above (3D connected components). */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Button
                            size="small"
                            variant="outlined"
                            disabled={isAnalyzing}
                            onClick={handleAnalyzeObjects}
                            sx={{ fontSize: '0.65rem', py: 0.4 }}
                        >
                            Objekte zählen
                        </Button>
                        {isAnalyzing && <CircularProgress size={12} thickness={5} />}
                    </Box>

                    {objectResult?.tooLarge && (
                        <Typography sx={{ ...labelSx, opacity: 0.7, fontSize: '0.62rem' }}>
                            Bereich zu groß ({objectResult.regionVoxels.toLocaleString()} vox) —
                            bitte eingrenzen
                        </Typography>
                    )}
                    {objectResult && !objectResult.tooLarge && (
                        <Stack spacing={0.25}>
                            <Typography sx={{ ...labelSx, fontWeight: 600, fontSize: '0.66rem' }}>
                                {objectResult.count}{' '}
                                {objectResult.count === 1 ? 'Objekt' : 'Objekte'} (≥{' '}
                                {MIN_OBJECT_VOXELS} vox)
                            </Typography>
                            {objectResult.objects.slice(0, OBJECT_LIST_LIMIT).map((o, i) => (
                                <Stack
                                    key={i}
                                    direction="row"
                                    justifyContent="space-between"
                                    sx={{ opacity: 0.7 }}
                                >
                                    <Typography sx={{ ...labelSx, fontSize: '0.6rem' }}>
                                        #{i + 1}
                                    </Typography>
                                    <Typography sx={{ ...labelSx, fontSize: '0.6rem' }}>
                                        {o.volumeMm3.toFixed(5)} mm³ · {o.voxels.toLocaleString()}{' '}
                                        vox
                                    </Typography>
                                </Stack>
                            ))}
                            {objectResult.count > OBJECT_LIST_LIMIT && (
                                <Typography sx={{ ...labelSx, opacity: 0.5, fontSize: '0.6rem' }}>
                                    + {objectResult.count - OBJECT_LIST_LIMIT} weitere
                                </Typography>
                            )}
                        </Stack>
                    )}
                </Stack>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Button
                    size="small"
                    variant="outlined"
                    disabled={isCropping || isFullVolume}
                    onClick={handleOpenCrop}
                    sx={{ fontSize: '0.65rem', py: 0.4 }}
                >
                    Open Crop
                </Button>
                {!isFullVolume && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="inherit"
                        disabled={isCropping}
                        onClick={() => setCropBox(fileKey, fullVolumeCropBox(activeH5.meta))}
                        sx={{ fontSize: '0.65rem', py: 0.4 }}
                    >
                        Reset
                    </Button>
                )}
                {isCropping && <CircularProgress size={12} thickness={5} />}
            </Box>
        </Stack>
    )
}
