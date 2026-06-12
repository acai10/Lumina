import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import TuneIcon from '@mui/icons-material/Tune'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useShallow } from 'zustand/react/shallow'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import {
    panelSx,
    railSx,
    headerSx,
    headerTitleSx,
    iconButtonSx,
    controlFontSx,
    accordionSx,
    accordionTitleSx,
    labelSx,
} from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS, getRenderControlLimits } from './renderControlLimits'
import { PreprocessingSection } from './PreprocessingSection'
import CropSection from './CropSection'
import { SliderRow, RangeSliderRow } from './SliderRow'
import type { ColormapType, H5RenderControls } from '../../shared/types/viewer.types'
import { measureVolume, uploadVolume } from '../../shared/api/client'
import type { MeasureResult } from '../../shared/api/client'
import { palette } from '../../shared/theme/palette'
import { DEFAULT_VOXEL_SIZE_UM, UM_PER_MM } from '../../shared/constants'

const NO_OVERLAY_SENTINEL = -1
const UM2_PER_MM2 = 1e6
const UM3_PER_MM3 = 1e9

const COLORMAP_VALUES: ColormapType[] = ['gray', 'jet', 'hot']
const isColormapType = (v: string): v is ColormapType => (COLORMAP_VALUES as string[]).includes(v)

function MeasurementResultPanel({ result }: { result: MeasureResult }) {
    const rows: [string, string][] = [
        ['Volumen', `${(result.volume_um3 / UM3_PER_MM3).toFixed(4)} mm³`],
        ['Oberfläche', `${(result.surface_area_um2 / UM2_PER_MM2).toFixed(4)} mm²`],
        ['Ø Dicke', `${(result.mean_thickness_um / UM_PER_MM).toFixed(3)} mm`],
        ['Max Dicke', `${(result.max_thickness_um / UM_PER_MM).toFixed(3)} mm`],
        ['Lat. Durchm.', `${(result.lateral_diameter_um / UM_PER_MM).toFixed(3)} mm`],
        ['Voxel', result.voxel_count.toLocaleString()],
    ]
    return (
        <Stack spacing={0.25}>
            {rows.map(([k, v]) => (
                <Stack key={k} direction="row" justifyContent="space-between">
                    <Typography sx={{ ...labelSx, opacity: 0.65 }}>{k}</Typography>
                    <Typography sx={{ ...labelSx, fontWeight: 600 }}>{v}</Typography>
                </Stack>
            ))}
        </Stack>
    )
}

function Section({
    title,
    defaultExpanded = true,
    children,
}: {
    title: string
    defaultExpanded?: boolean
    children: ReactNode
}) {
    return (
        <Accordion disableGutters defaultExpanded={defaultExpanded} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" sx={iconButtonSx} />}>
                <Typography sx={accordionTitleSx}>{title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack spacing={2.5}>{children}</Stack>
            </AccordionDetails>
        </Accordion>
    )
}

export default function ControlsPanel() {
    const {
        tabs,
        activeTabIndex,
        h5PerFileStates,
        updateActiveRenderState,
        stlOpacity,
        setStlOpacity,
        setH5ViewMode,
        resetSlicePanelControls,
        stlOverlayIndex,
        setStlOverlayIndex,
        controlsPanelOpen,
        toggleControlsPanel,
        setSliceColormap,
        setSliceColormapRange,
        setColorByDepth,
        setSliceVoxelSizeUm,
        setMeasurementResult,
        setBackendVolumeId,
        setNotification,
        requestCameraReset,
    } = useViewerStore(
        useShallow((s) => ({
            tabs: s.tabs,
            activeTabIndex: s.activeTabIndex,
            h5PerFileStates: s.h5PerFileStates,
            updateActiveRenderState: s.updateActiveRenderState,
            stlOpacity: s.stlOpacity,
            setStlOpacity: s.setStlOpacity,
            setH5ViewMode: s.setH5ViewMode,
            resetSlicePanelControls: s.resetSlicePanelControls,
            stlOverlayIndex: s.stlOverlayIndex,
            setStlOverlayIndex: s.setStlOverlayIndex,
            controlsPanelOpen: s.controlsPanelOpen,
            toggleControlsPanel: s.toggleControlsPanel,
            setSliceColormapRange: s.setSliceColormapRange,
            setColorByDepth: s.setColorByDepth,
            setSliceColormap: s.setSliceColormap,
            setSliceVoxelSizeUm: s.setSliceVoxelSizeUm,
            setMeasurementResult: s.setMeasurementResult,
            setBackendVolumeId: s.setBackendVolumeId,
            setNotification: s.setNotification,
            requestCameraReset: s.requestCameraReset,
        })),
    )

    const [isMeasuring, setIsMeasuring] = useState(false)
    const [voxelSize, setVoxelSize] = useState<[number, number, number]>(DEFAULT_VOXEL_SIZE_UM)

    const activeTab = tabs[activeTabIndex]
    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null
    const activeKey = activeH5?.name

    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls
    const viewMode = (activeKey ? h5PerFileStates[activeKey]?.viewMode : undefined) ?? 'pointcloud'
    const limits = getRenderControlLimits(activeH5?.meta)
    const hasSliceView = !!activeH5?.hasSlices
    const hasVolumeSource = !!(
        activeH5?.registeredVolumeId ||
        activeH5?.backendVolumeId ||
        activeH5?.sourceFile
    )

    const sliceColormap: ColormapType =
        (activeKey ? h5PerFileStates[activeKey]?.sliceColormap : undefined) ?? 'gray'
    const colormapRange: [number, number] = (activeKey
        ? h5PerFileStates[activeKey]?.sliceColormapRange
        : undefined) ?? [0, 1]
    const colorByDepth = (activeKey ? h5PerFileStates[activeKey]?.colorByDepth : undefined) ?? false

    const stlTabs = useMemo(
        () => tabs.flatMap((t, i) => (t.type === 'stl' ? [{ tab: t, index: i }] : [])),
        [tabs],
    )

    const updateControls = useCallback(
        (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch),
        [updateActiveRenderState],
    )

    const resolveVolumeId = useCallback(async (): Promise<string | null> => {
        if (!activeH5 || !activeKey) return null
        const existing = activeH5.registeredVolumeId ?? activeH5.backendVolumeId
        if (existing) return existing
        if (!activeH5.sourceFile) return null
        const { volume_id } = await uploadVolume(activeH5.sourceFile)
        setBackendVolumeId(activeKey, volume_id)
        return volume_id
    }, [activeH5, activeKey, setBackendVolumeId])

    const handleReset = useCallback(() => {
        if (activeH5) {
            if (viewMode === 'slice' && activeKey) {
                resetSlicePanelControls(activeKey)
            } else {
                const { nSlices, height, width } = activeH5.meta
                updateActiveRenderState({
                    ...defaultRenderControls,
                    h5SliceRange: [0, nSlices],
                    h5HeightRange: [0, height],
                    h5WidthRange: [0, width],
                })
                if (activeKey) requestCameraReset(activeKey)
            }
        } else {
            setStlOpacity(DEFAULT_STL_OPACITY)
        }
    }, [
        activeH5,
        viewMode,
        activeKey,
        resetSlicePanelControls,
        updateActiveRenderState,
        setStlOpacity,
        requestCameraReset,
    ])

    if (tabs.length === 0) return null

    if (!controlsPanelOpen) {
        return (
            <Box sx={railSx}>
                <Tooltip title="Show controls" placement="right">
                    <IconButton
                        size="small"
                        aria-label="Show controls"
                        onClick={toggleControlsPanel}
                        sx={iconButtonSx}
                    >
                        <TuneIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        )
    }

    return (
        <Stack spacing={1.5} sx={panelSx}>
            <Box sx={headerSx}>
                <Typography sx={headerTitleSx}>CONTROLS</Typography>
                <Stack direction="row" spacing={0.25}>
                    <Tooltip title="Reset">
                        <IconButton
                            size="small"
                            aria-label="Reset controls"
                            onClick={handleReset}
                            sx={iconButtonSx}
                        >
                            <RestartAltIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Collapse">
                        <IconButton
                            size="small"
                            aria-label="Collapse controls"
                            onClick={toggleControlsPanel}
                            sx={iconButtonSx}
                        >
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {activeH5 && (
                <>
                    {/* View mode: 3D / Slices */}
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        size="small"
                        onChange={(_, v) => {
                            if (v && activeKey) setH5ViewMode(activeKey, v)
                        }}
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        <ToggleButton value="pointcloud">3D</ToggleButton>
                        {hasSliceView && <ToggleButton value="slice">Slices</ToggleButton>}
                    </ToggleButtonGroup>

                    {/* Colormap selector — applies to both 3D and slice view */}
                    <Stack spacing={0.5}>
                        <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>
                            COLORMAP
                        </Typography>
                        <ToggleButtonGroup
                            value={sliceColormap}
                            exclusive
                            size="small"
                            onChange={(_, v) => {
                                if (v && activeKey && isColormapType(v))
                                    setSliceColormap(activeKey, v)
                            }}
                            sx={{ alignSelf: 'flex-start' }}
                        >
                            <ToggleButton value="gray">GRAY</ToggleButton>
                            <ToggleButton value="jet">JET</ToggleButton>
                            <ToggleButton value="hot">HOT</ToggleButton>
                        </ToggleButtonGroup>
                        <RangeSliderRow
                            label="Intensität"
                            value={colormapRange}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => activeKey && setSliceColormapRange(activeKey, v)}
                        />
                        {/* Depth coloring — 3D only: maps slice position → full colormap */}
                        {viewMode === 'pointcloud' && (
                            <ToggleButtonGroup
                                value={colorByDepth ? 'depth' : 'intensity'}
                                exclusive
                                size="small"
                                onChange={(_, v) => {
                                    if (v && activeKey) setColorByDepth(activeKey, v === 'depth')
                                }}
                                sx={{ alignSelf: 'flex-start' }}
                            >
                                <ToggleButton value="intensity">Intensität</ToggleButton>
                                <ToggleButton value="depth">Tiefe</ToggleButton>
                            </ToggleButtonGroup>
                        )}
                    </Stack>

                    <PreprocessingSection />

                    {/* Crop selection → opens the sub-volume as a new independent tab */}
                    <CropSection activeH5={activeH5} />

                    {/* Segmentation */}
                    {/* Measurements */}
                    {hasVolumeSource && (
                        <Stack spacing={0.75}>
                            <Typography sx={{ ...labelSx, letterSpacing: '0.08em', opacity: 0.7 }}>
                                MESSUNGEN
                            </Typography>
                            {/* Voxel spacing inputs (dz, dy, dx) in µm */}
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <Typography sx={{ ...labelSx, minWidth: 56 }}>µm/vox</Typography>
                                {(['dz', 'dy', 'dx'] as const).map((label, i) => (
                                    <Box
                                        key={label}
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 0.25,
                                        }}
                                    >
                                        <Typography
                                            sx={{ ...labelSx, fontSize: '0.6rem', opacity: 0.6 }}
                                        >
                                            {label}
                                        </Typography>
                                        <input
                                            type="number"
                                            min={0.001}
                                            step={0.1}
                                            value={voxelSize[i]}
                                            onChange={(e) => {
                                                const v = parseFloat(e.target.value)
                                                if (!isNaN(v) && v > 0) {
                                                    const next: [number, number, number] = [
                                                        ...voxelSize,
                                                    ]
                                                    next[i] = v
                                                    setVoxelSize(next)
                                                    if (activeKey)
                                                        setSliceVoxelSizeUm(activeKey, next)
                                                }
                                            }}
                                            style={{
                                                width: 52,
                                                fontSize: '0.72rem',
                                                padding: '2px 4px',
                                                borderRadius: 4,
                                                border: `1px solid ${palette.borderGlass}`,
                                                background: palette.surfaceSolid,
                                                color: palette.textPrimary,
                                                textAlign: 'right',
                                            }}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={isMeasuring}
                                    onClick={async () => {
                                        if (!activeKey) return
                                        setIsMeasuring(true)
                                        try {
                                            const volumeId = await resolveVolumeId()
                                            if (!volumeId) return
                                            const result = await measureVolume(volumeId, {
                                                threshold: renderControls.h5Threshold,
                                                voxel_size_um: voxelSize,
                                            })
                                            setMeasurementResult(activeKey, result)
                                        } catch (err) {
                                            setNotification({
                                                message:
                                                    err instanceof Error
                                                        ? err.message
                                                        : 'Messung fehlgeschlagen',
                                                severity: 'error',
                                            })
                                        } finally {
                                            setIsMeasuring(false)
                                        }
                                    }}
                                    sx={{ fontSize: '0.65rem', py: 0.4 }}
                                >
                                    Messung starten
                                </Button>
                                {isMeasuring && <CircularProgress size={12} thickness={5} />}
                            </Box>
                            {activeKey && h5PerFileStates[activeKey]?.measurementResult && (
                                <MeasurementResultPanel
                                    result={h5PerFileStates[activeKey].measurementResult!}
                                />
                            )}
                        </Stack>
                    )}

                    {viewMode === 'pointcloud' && (
                        <>
                            <Section title="APPEARANCE">
                                <SliderRow
                                    label="Volume spacing"
                                    value={renderControls.volumeSpacing}
                                    {...RENDER_CONTROL_LIMITS.volumeSpacing}
                                    onChange={(v) => updateControls({ volumeSpacing: v })}
                                />
                                <SliderRow
                                    label="H5 threshold"
                                    value={renderControls.h5Threshold}
                                    {...RENDER_CONTROL_LIMITS.h5Threshold}
                                    onChange={(v) => updateControls({ h5Threshold: v })}
                                />
                                <SliderRow
                                    label="H5 opacity"
                                    value={renderControls.h5Opacity}
                                    {...RENDER_CONTROL_LIMITS.h5Opacity}
                                    onChange={(v) => updateControls({ h5Opacity: v })}
                                />
                                <SliderRow
                                    label="H5 brightness"
                                    value={renderControls.h5Brightness}
                                    {...RENDER_CONTROL_LIMITS.h5Brightness}
                                    onChange={(v) => updateControls({ h5Brightness: v })}
                                />
                                <SliderRow
                                    label="H5 contrast"
                                    value={renderControls.h5Contrast}
                                    {...RENDER_CONTROL_LIMITS.h5Contrast}
                                    onChange={(v) => updateControls({ h5Contrast: v })}
                                />
                                <SliderRow
                                    label="H5 point size"
                                    value={renderControls.h5PointSize}
                                    {...RENDER_CONTROL_LIMITS.h5PointSize}
                                    onChange={(v) => updateControls({ h5PointSize: v })}
                                />
                            </Section>
                            <Section title="CLIPPING">
                                <RangeSliderRow
                                    label="Slices (Y)"
                                    value={renderControls.h5SliceRange}
                                    {...limits.h5SliceRange}
                                    onChange={(v) => updateControls({ h5SliceRange: v })}
                                />
                                <RangeSliderRow
                                    label="Width (X)"
                                    value={renderControls.h5WidthRange}
                                    {...limits.h5WidthRange}
                                    onChange={(v) => updateControls({ h5WidthRange: v })}
                                />
                                <RangeSliderRow
                                    label="Height (Z)"
                                    value={renderControls.h5HeightRange}
                                    {...limits.h5HeightRange}
                                    onChange={(v) => updateControls({ h5HeightRange: v })}
                                />
                            </Section>
                            {stlTabs.length > 0 && (
                                <Section title="STL OVERLAY" defaultExpanded={false}>
                                    <Select
                                        size="small"
                                        value={stlOverlayIndex ?? NO_OVERLAY_SENTINEL}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            setStlOverlayIndex(v === NO_OVERLAY_SENTINEL ? null : v)
                                        }}
                                        sx={controlFontSx}
                                    >
                                        <MenuItem value={NO_OVERLAY_SENTINEL} sx={controlFontSx}>
                                            None
                                        </MenuItem>
                                        {stlTabs.map(({ tab, index }) => (
                                            <MenuItem
                                                key={tab.name}
                                                value={index}
                                                sx={controlFontSx}
                                            >
                                                {tab.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    {stlOverlayIndex !== null && (
                                        <SliderRow
                                            label="STL opacity"
                                            value={stlOpacity}
                                            {...RENDER_CONTROL_LIMITS.stlOpacity}
                                            onChange={setStlOpacity}
                                        />
                                    )}
                                </Section>
                            )}
                        </>
                    )}
                </>
            )}
            {activeStl && (
                <SliderRow
                    label="STL opacity"
                    value={stlOpacity}
                    {...RENDER_CONTROL_LIMITS.stlOpacity}
                    onChange={setStlOpacity}
                />
            )}
        </Stack>
    )
}
