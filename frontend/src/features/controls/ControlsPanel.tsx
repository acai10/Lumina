import { Divider, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import { panelSx, resetButtonSx } from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { PreprocessingSection } from './PreprocessingSection'
import { SliderRow, RangeSliderRow } from './SliderRow'
import type { H5RenderControls } from '../../shared/types/viewer.types'

export default function ControlsPanel() {
    const {
        mode,
        h5Files,
        activeH5Index,
        h5PerFileStates,
        updateActiveRenderState,
        stlOpacity,
        setStlOpacity,
        setH5ViewMode,
        setH5SliceIndex,
    } = useViewerStore()

    const activeKey = h5Files[activeH5Index]?.name
    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls
    const viewMode = (activeKey ? h5PerFileStates[activeKey]?.viewMode : undefined) ?? 'pointcloud'
    const sliceIndex = (activeKey ? h5PerFileStates[activeKey]?.sliceIndex : undefined) ?? 256
    const nSlices = h5Files[activeH5Index]?.data.nSlices ?? 512

    const updateControls = (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch)

    if (mode === 'none') return null

    return (
        <Stack spacing={4} sx={panelSx}>
            {mode === 'h5' && (
                <>
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
                        <ToggleButton value="slice">Slices</ToggleButton>
                    </ToggleButtonGroup>
                    <PreprocessingSection />
                    <Divider sx={{ opacity: 0.2 }} />
                    {viewMode === 'pointcloud' && (
                        <>
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
                            <RangeSliderRow
                                label="Slices (Y)"
                                value={renderControls.h5SliceRange}
                                {...RENDER_CONTROL_LIMITS.h5SliceRange}
                                onChange={(v) => updateControls({ h5SliceRange: v })}
                            />
                            <RangeSliderRow
                                label="Width (X)"
                                value={renderControls.h5WidthRange}
                                {...RENDER_CONTROL_LIMITS.h5WidthRange}
                                onChange={(v) => updateControls({ h5WidthRange: v })}
                            />
                            <RangeSliderRow
                                label="Height (Z)"
                                value={renderControls.h5HeightRange}
                                {...RENDER_CONTROL_LIMITS.h5HeightRange}
                                onChange={(v) => updateControls({ h5HeightRange: v })}
                            />
                        </>
                    )}
                    {viewMode === 'slice' && (
                        <>
                            <SliderRow
                                label="Slice"
                                value={sliceIndex}
                                min={0}
                                max={nSlices - 1}
                                step={1}
                                onChange={(v) => {
                                    if (activeKey) setH5SliceIndex(activeKey, Math.round(v))
                                }}
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
                        </>
                    )}
                </>
            )}
            {mode === 'stl' && (
                <SliderRow
                    label="STL opacity"
                    value={stlOpacity}
                    {...RENDER_CONTROL_LIMITS.stlOpacity}
                    onChange={setStlOpacity}
                />
            )}
            <Tooltip title="Reset" placement="right">
                <IconButton
                    size="small"
                    onClick={() => {
                        if (mode === 'h5') updateActiveRenderState({ ...defaultRenderControls })
                        else setStlOpacity(DEFAULT_STL_OPACITY)
                    }}
                    sx={resetButtonSx}
                >
                    <RestartAltIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
