import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useShallow } from 'zustand/react/shallow'
import {
    useViewerStore,
    fullVolumeCropBox,
    defaultRenderControls,
} from '../../app/store/viewerSlice'
import type { AnnotationTool, CropBox, H5TabEntry } from '../../shared/types/viewer.types'
import { DEFAULT_VOXEL_SIZE_UM, UINT8_MAX, UM_PER_MM } from '../../shared/constants'
import { useOpenCrop } from './useOpenCrop'
import { RangeSliderRow } from './SliderRow'
import { labelSx } from './ControlsPanel.styles'
import {
    analyzeRegionObjects,
    objectColorRgb,
    MIN_OBJECT_VOXELS,
    type CropObjectResult,
} from './cropObjectAnalysis'

/** CSS rgb() string for an object's rank colour (1-based), matching the viewers. */
const rankColorCss = (rank: number): string => {
    const [r, g, b] = objectColorRgb(rank)
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
}

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
        cropShape,
        rawCropBox,
        threshold,
        voxelSizeUm,
        objectColorsVisible,
        setCropMode,
        setCropShape,
        setActiveTool,
        setCropBox,
        updateActiveRenderState,
        setObjectLabeling,
        setObjectColorsVisible,
    } = useViewerStore(
        useShallow((s) => ({
            cropMode: s.h5PerFileStates[fileKey]?.cropMode ?? false,
            cropShape: s.h5PerFileStates[fileKey]?.cropShape ?? 'rect',
            // Raw (possibly undefined) so useShallow keeps a stable reference; the
            // full-volume default is derived below to avoid a fresh object per render.
            rawCropBox: s.h5PerFileStates[fileKey]?.cropBox,
            // The crop signal/count threshold IS the render visibility threshold, so a
            // voxel is "signal" exactly when it is shown in the 3D cloud.
            threshold:
                s.h5PerFileStates[fileKey]?.renderControls?.h5Threshold ??
                defaultRenderControls.h5Threshold,
            voxelSizeUm: s.h5PerFileStates[fileKey]?.sliceVoxelSizeUm ?? DEFAULT_VOXEL_SIZE_UM,
            objectColorsVisible: s.h5PerFileStates[fileKey]?.objectColorsVisible ?? false,
            setCropMode: s.setCropMode,
            setCropShape: s.setCropShape,
            setActiveTool: s.setActiveTool,
            setCropBox: s.setCropBox,
            updateActiveRenderState: s.updateActiveRenderState,
            setObjectLabeling: s.setObjectLabeling,
            setObjectColorsVisible: s.setObjectColorsVisible,
        })),
    )

    // Shape buttons drive crop mode + the active crop tool (so the 2D drag and 3D
    // gizmo respond). Picking the active shape again turns cropping off.
    const CROP_SHAPES = [
        { shape: 'rect' as const, tool: 'rectCrop' as const, label: 'Rectangle' },
        { shape: 'circle' as const, tool: 'circleCrop' as const, label: 'Circle/Cylinder' },
        { shape: 'sphere' as const, tool: 'sphereCrop' as const, label: 'Sphere' },
    ]
    const selectCropShape = (shape: 'rect' | 'circle' | 'sphere', tool: AnnotationTool) => {
        const isActive = cropMode && cropShape === shape
        if (isActive) {
            setActiveTool(null)
            setCropMode(fileKey, false)
            return
        }
        setCropShape(fileKey, shape)
        setActiveTool(tool)
        setCropMode(fileKey, true)
    }
    const cropBox = rawCropBox ?? fullVolumeCropBox(activeH5.meta)
    const { openCrop, isCropping } = useOpenCrop(activeH5)

    const [isAnalyzing, setIsAnalyzing] = useState(false)
    // Object result is tagged with the box/threshold it was computed for, so a
    // stale count is simply ignored at render when the selection changes — no effect.
    const [analysis, setAnalysis] = useState<{ key: string; result: CropObjectResult } | null>(null)

    const { x, y, z, w, h, d } = cropBox
    const analysisKey = `${x},${y},${z},${w},${h},${d},${threshold}`
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
                threshold,
                voxelSizeUm,
            )
            setAnalysis({ key: analysisKey, result })
            // Persist the labelling so the detected objects can be coloured in the
            // slice and 3D viewers; clear it when the region was too large to label.
            setObjectLabeling(
                fileKey,
                result.tooLarge || !result.labels
                    ? null
                    : {
                          box: cropBox,
                          threshold,
                          labels: result.labels,
                          count: result.count,
                      },
            )
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
        const thr = Math.round(threshold * UINT8_MAX)
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
    }, [normalizedVolume, cropBox, threshold, height, width, dz, dy, dx])

    const isFullVolume =
        cropBox.x === 0 &&
        cropBox.y === 0 &&
        cropBox.z === 0 &&
        cropBox.w === width &&
        cropBox.h === height &&
        cropBox.d === nSlices

    return (
        <Stack spacing={0.75}>
            <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>CROP</Typography>

            {/* Region shape — selecting one enables crop drawing (2D drag + 3D move
                gizmo); selecting the active one again turns it off. */}
            <ToggleButtonGroup
                exclusive
                size="small"
                value={cropMode ? cropShape : null}
                sx={{ alignSelf: 'flex-start' }}
            >
                {CROP_SHAPES.map(({ shape, tool, label }) => (
                    <ToggleButton
                        key={shape}
                        value={shape}
                        onClick={() => selectCropShape(shape, tool)}
                        sx={{ fontSize: '0.6rem', py: 0.3, px: 0.9, textTransform: 'none' }}
                    >
                        {label}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <RangeSliderRow
                label="X (Width)"
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
                label="Z (Depth)"
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
                        <Typography sx={{ ...labelSx, minWidth: 64 }}>Visible ≥</Typography>
                        <Slider
                            size="small"
                            value={threshold}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(_, v) =>
                                updateActiveRenderState({
                                    h5Threshold: typeof v === 'number' ? v : v[0],
                                })
                            }
                            sx={{ flex: 1 }}
                        />
                        <Typography sx={{ ...labelSx, minWidth: 30, textAlign: 'right' }}>
                            {threshold.toFixed(2)}
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
                            Count objects
                        </Button>
                        {objectResult && !objectResult.tooLarge && objectResult.count > 0 && (
                            <Button
                                size="small"
                                variant={objectColorsVisible ? 'contained' : 'outlined'}
                                onClick={() =>
                                    setObjectColorsVisible(fileKey, !objectColorsVisible)
                                }
                                sx={{ fontSize: '0.65rem', py: 0.4 }}
                            >
                                {objectColorsVisible ? 'Coloring on' : 'Coloring off'}
                            </Button>
                        )}
                        {isAnalyzing && <CircularProgress size={12} thickness={5} />}
                    </Box>

                    {objectResult?.tooLarge && (
                        <Typography sx={{ ...labelSx, opacity: 0.7, fontSize: '0.62rem' }}>
                            Region too large ({objectResult.regionVoxels.toLocaleString()} vox) —
                            please narrow it down
                        </Typography>
                    )}
                    {objectResult && !objectResult.tooLarge && (
                        <Stack spacing={0.25}>
                            <Typography sx={{ ...labelSx, fontWeight: 600, fontSize: '0.66rem' }}>
                                {objectResult.count}{' '}
                                {objectResult.count === 1 ? 'object' : 'objects'} (≥{' '}
                                {MIN_OBJECT_VOXELS} vox)
                            </Typography>
                            {objectResult.objects.slice(0, OBJECT_LIST_LIMIT).map((o, i) => (
                                <Stack
                                    key={i}
                                    direction="row"
                                    justifyContent="space-between"
                                    alignItems="center"
                                    sx={{ opacity: 0.8 }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Box
                                            sx={{
                                                width: 9,
                                                height: 9,
                                                borderRadius: '2px',
                                                flexShrink: 0,
                                                backgroundColor: rankColorCss(i + 1),
                                            }}
                                        />
                                        <Typography sx={{ ...labelSx, fontSize: '0.6rem' }}>
                                            #{i + 1}
                                        </Typography>
                                    </Stack>
                                    <Typography sx={{ ...labelSx, fontSize: '0.6rem' }}>
                                        {o.volumeMm3.toFixed(5)} mm³ · {o.voxels.toLocaleString()}{' '}
                                        vox
                                    </Typography>
                                </Stack>
                            ))}
                            {objectResult.count > OBJECT_LIST_LIMIT && (
                                <Typography sx={{ ...labelSx, opacity: 0.5, fontSize: '0.6rem' }}>
                                    + {objectResult.count - OBJECT_LIST_LIMIT} more
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
                    onClick={() => void openCrop()}
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
