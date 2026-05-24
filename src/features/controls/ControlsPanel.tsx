import { Divider, IconButton, Stack, Tooltip } from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import {
    panelSx,
    resetButtonSx,
} from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS } from './renderControlLimits'
import { SliderRow, RangeSliderRow } from './SliderRow'
import PreprocessingSection from './PreprocessingSection'
import type { H5RenderControls } from '../../shared/types/viewer.types'

export default function ControlsPanel() {
    const {
        mode,
        h5Files,
        activeH5Index,
        h5PerFileStates,
        updateActiveRenderState,
        reprocessActiveH5,
        stlOpacity,
        setStlOpacity,
    } = useViewerStore()

    const activeKey = h5Files[activeH5Index]?.name
    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls

    const updateControls = (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch)

    if (mode === 'none') return null

    return (
        <Stack spacing={4} sx={panelSx}>
            {mode === 'h5' && (
                <>
                    <PreprocessingSection />
                    <Divider sx={{ borderColor: 'rgba(100,255,200,0.1)' }} />
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
                        if (mode === 'h5') {
                            updateActiveRenderState({ ...defaultRenderControls })
                            if (renderControls.filterParams.type !== 'none') {
                                reprocessActiveH5({ type: 'none' })
                            }
                        } else {
                            setStlOpacity(DEFAULT_STL_OPACITY)
                        }
                    }}
                    sx={resetButtonSx}
                >
                    <RestartAltIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
